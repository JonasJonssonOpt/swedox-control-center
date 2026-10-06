begin;

-- Change-step after F2E4: catalog v1 gains the step "initial_administrator"
-- (create the customer's first administrator and send the invitation) at
-- position 4, before verification. Catalog v1 was never released and no run
-- exists in any environment, so this refuses to run if one does instead of
-- silently reinterpreting history. See docs/PROVISIONING_DOMAIN_DESIGN.md.

lock table public.provisioning_runs, public.provisioning_run_steps,
  public.provisioning_step_attempts, public.provisioning_audit_events
  in share row exclusive mode;

do $preflight$
begin
  if exists (select 1 from public.provisioning_runs)
    or exists (select 1 from public.provisioning_run_steps)
    or exists (select 1 from public.provisioning_step_attempts)
    or exists (select 1 from public.provisioning_audit_events)
  then
    raise exception using errcode = '55000',
      message = 'provisioning catalog change requires an empty provisioning history';
  end if;
end;
$preflight$;

alter table public.provisioning_run_steps
  drop constraint ck_provisioning_run_steps_catalog;
alter table public.provisioning_run_steps
  add constraint ck_provisioning_run_steps_catalog check (
    (step_key, position) in (
      ('supabase_project', 1::smallint),
      ('database_schema', 2::smallint),
      ('application_deployment', 3::smallint),
      ('initial_administrator', 4::smallint),
      ('installation_verification', 5::smallint)
    )
  );

alter table public.provisioning_audit_events
  drop constraint ck_provisioning_audit_events_step;
alter table public.provisioning_audit_events
  add constraint ck_provisioning_audit_events_step check (
    (event_type in ('run_requested', 'run_cancelled'))
      = (step_key is null and attempt_number is null)
    and (step_key is null or step_key in (
      'supabase_project', 'database_schema', 'application_deployment',
      'initial_administrator', 'installation_verification'
    ))
    and (step_key is null) = (attempt_number is null)
    and (attempt_number is null or attempt_number > 0)
    and (event_type <> 'run_succeeded' or step_key = 'installation_verification')
  );

create or replace function public.enforce_provisioning_run_integrity()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  target_run_id uuid;
  run_row public.provisioning_runs%rowtype;
  latest public.provisioning_step_attempts%rowtype;
  attempt_total integer;
begin
  if TG_WHEN <> 'AFTER' or TG_LEVEL <> 'ROW' or TG_NARGS <> 0
    or TG_OP not in ('INSERT', 'UPDATE') then
    raise exception using errcode = '23514', message = 'provisioning run integrity violation';
  end if;
  if TG_RELID = 'public.provisioning_runs'::regclass then
    target_run_id := NEW.id;
  else
    target_run_id := NEW.run_id;
  end if;

  select * into run_row from public.provisioning_runs
  where id = target_run_id for no key update;
  if not found then
    raise exception using errcode = '23514', message = 'provisioning run integrity violation';
  end if;

  select count(*) into attempt_total
  from public.provisioning_step_attempts where run_id = run_row.id;
  select * into latest from public.provisioning_step_attempts
  where run_id = run_row.id order by started_revision desc limit 1;

  if
    -- Contiguous audit revisions 1..revision (positive, unique, count = max).
    (select count(*) from public.provisioning_audit_events where run_id = run_row.id) <> run_row.revision
    or (select max(revision_after) from public.provisioning_audit_events where run_id = run_row.id)
      is distinct from run_row.revision
    -- Exactly the five catalog steps.
    or (select count(*) from public.provisioning_run_steps where run_id = run_row.id) <> 5
    -- Contiguous attempt numbers matching attempt_count per step.
    or exists (
      select 1 from public.provisioning_run_steps s
      where s.run_id = run_row.id
        and (s.attempt_count <> (select count(*) from public.provisioning_step_attempts a
              where a.run_id = s.run_id and a.step_key = s.step_key)
          or coalesce((select max(attempt_number) from public.provisioning_step_attempts a
              where a.run_id = s.run_id and a.step_key = s.step_key), 0) <> s.attempt_count)
    )
    -- Step status mirrors its latest attempt, only the latest may be open/succeeded.
    or exists (
      select 1 from public.provisioning_run_steps s
      left join lateral (
        select a.outcome from public.provisioning_step_attempts a
        where a.run_id = s.run_id and a.step_key = s.step_key
        order by a.attempt_number desc limit 1
      ) last_attempt on true
      where s.run_id = run_row.id
        and s.status is distinct from case
          when last_attempt.outcome is null and s.attempt_count > 0 then 'in_progress'
          when last_attempt.outcome = 'succeeded' then 'succeeded'
          when last_attempt.outcome = 'failed' then 'failed'
          else 'pending'
        end
    )
    or exists (
      select 1 from public.provisioning_step_attempts a
      where a.run_id = run_row.id
        and (a.outcome is null or a.outcome = 'succeeded')
        and a.attempt_number < (select max(b.attempt_number) from public.provisioning_step_attempts b
          where b.run_id = a.run_id and b.step_key = a.step_key)
    )
    -- Steps complete strictly in catalog order, only the first unfinished step
    -- may have attempts or be active.
    or exists (
      select 1 from public.provisioning_run_steps s
      where s.run_id = run_row.id
        and s.position > coalesce((
          select min(f.position) from public.provisioning_run_steps f
          where f.run_id = run_row.id and f.status <> 'succeeded'), 6)
        and (s.status <> 'pending' or s.attempt_count <> 0)
    )
    -- Attempts never outlive the run revision.
    or exists (
      select 1 from public.provisioning_step_attempts a
      where a.run_id = run_row.id
        and (a.started_revision > run_row.revision or a.finished_revision > run_row.revision)
    )
    -- Run status follows the steps and the latest attempt.
    or run_row.status is distinct from (case
      when run_row.status = 'cancelled' then 'cancelled'
      when attempt_total = 0 then 'pending'
      when not exists (select 1 from public.provisioning_run_steps s
        where s.run_id = run_row.id and s.status <> 'succeeded') then 'succeeded'
      when latest.outcome = 'blocked' then 'blocked'
      when latest.outcome = 'failed' then 'failed'
      when latest.outcome is null or latest.outcome = 'succeeded' then 'in_progress'
      else 'invalid'
    end)
    or (run_row.status = 'blocked' and run_row.blocked_reason is distinct from latest.blocked_reason)
    or (run_row.status = 'cancelled' and (
      exists (select 1 from public.provisioning_step_attempts a
        where a.run_id = run_row.id and a.outcome is null)
      or not exists (select 1 from public.provisioning_run_steps s
        where s.run_id = run_row.id and s.status <> 'succeeded')
      or not exists (select 1 from public.provisioning_audit_events e
        where e.run_id = run_row.id and e.event_type = 'run_cancelled'
          and e.revision_after = run_row.revision)
    ))
    or exists (select 1 from public.provisioning_step_attempts a
      where a.run_id = run_row.id and a.outcome = 'cancelled'
        and (run_row.status <> 'cancelled' or a.finished_revision <> run_row.revision))
    -- Results exist exactly when their step succeeded.
    or (run_row.result_supabase_project_ref is not null) is distinct from exists (
      select 1 from public.provisioning_run_steps s where s.run_id = run_row.id
        and s.step_key = 'supabase_project' and s.status = 'succeeded')
    or (run_row.result_hosting_region is not null) is distinct from (run_row.result_supabase_project_ref is not null)
    or (run_row.result_application_url is not null) is distinct from exists (
      select 1 from public.provisioning_run_steps s where s.run_id = run_row.id
        and s.step_key = 'application_deployment' and s.status = 'succeeded')
    -- Every attempt has its start event and, when finished, its finish event.
    or exists (
      select 1 from public.provisioning_step_attempts a
      where a.run_id = run_row.id
        and (
          not exists (select 1 from public.provisioning_audit_events e
            where e.run_id = a.run_id and e.revision_after = a.started_revision
              and e.step_key = a.step_key and e.attempt_number = a.attempt_number
              and e.event_type = case when a.outcome = 'blocked' then 'step_blocked' else 'step_started' end)
          or (a.outcome in ('succeeded', 'failed') and not exists (
            select 1 from public.provisioning_audit_events e
            where e.run_id = a.run_id and e.revision_after = a.finished_revision
              and e.step_key = a.step_key and e.attempt_number = a.attempt_number
              and (case when a.outcome = 'failed' then e.event_type = 'step_failed'
                else e.event_type in ('step_succeeded', 'run_succeeded') end)))
        )
    )
    -- Every step event points at exactly such an attempt.
    or exists (
      select 1 from public.provisioning_audit_events e
      where e.run_id = run_row.id and e.step_key is not null
        and not exists (
          select 1 from public.provisioning_step_attempts a
          where a.run_id = e.run_id and a.step_key = e.step_key
            and a.attempt_number = e.attempt_number
            and case e.event_type
              when 'step_started' then a.started_revision = e.revision_after and a.outcome is distinct from 'blocked'
              when 'step_blocked' then a.started_revision = e.revision_after and a.outcome = 'blocked'
              when 'step_failed' then a.finished_revision = e.revision_after and a.outcome = 'failed'
              else a.finished_revision = e.revision_after and a.outcome = 'succeeded'
            end
        )
    )
    -- run_succeeded exactly for the final step, cancellation only as last event.
    or exists (select 1 from public.provisioning_audit_events e
      where e.run_id = run_row.id
        and ((e.event_type = 'run_succeeded') is distinct from
              (e.event_type in ('step_succeeded', 'run_succeeded') and e.step_key = 'installation_verification'))
    )
    or exists (select 1 from public.provisioning_audit_events e
      where e.run_id = run_row.id and e.event_type = 'run_cancelled'
        and e.revision_after <> run_row.revision)
  then
    raise exception using errcode = '23514', message = 'provisioning run integrity violation';
  end if;
  return null;
end;
$function$;

comment on table public.provisioning_run_steps is
  'Catalog v1 steps (five) created with the run, completion is final and in catalog order.';
comment on function public.get_provisioning_run(uuid) is
  'F2E4: owner+AAL2 run detail, one row per catalog step (five) with derived 24-hour staleness of the open attempt.';

commit;
