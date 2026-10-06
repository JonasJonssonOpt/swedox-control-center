begin;

-- F2E3: Provisioning database foundation. Four fail-closed tables, structural
-- immutability, finalize-once attempts and a deferred final-state integrity
-- check. No RPCs, policies or API grants: reads and mutations follow in
-- F2E4/F2E5. See docs/PROVISIONING_DOMAIN_DESIGN.md (F2E2).

create table public.provisioning_runs (
  id uuid not null default gen_random_uuid(),
  installation_id uuid not null,
  catalog_version integer not null default 1,
  status text not null default 'pending',
  blocked_reason text,
  result_supabase_project_ref text,
  result_hosting_region text,
  result_application_url text,
  revision bigint not null default 1,
  created_at timestamptz not null default current_timestamp,
  created_by uuid not null,
  updated_at timestamptz not null default current_timestamp,
  updated_by uuid not null,
  finished_at timestamptz,
  constraint pk_provisioning_runs primary key (id),
  constraint fk_provisioning_runs_installation_id foreign key (installation_id)
    references public.installations(id) on delete restrict,
  constraint ck_provisioning_runs_catalog_version check (catalog_version = 1),
  constraint ck_provisioning_runs_status check (status in (
    'pending', 'in_progress', 'blocked', 'failed', 'succeeded', 'cancelled'
  )),
  constraint ck_provisioning_runs_blocked_reason check (
    (status = 'blocked') = (blocked_reason is not null)
    and (blocked_reason is null or blocked_reason in (
      'installation_not_available', 'tenant_not_available', 'license_missing',
      'license_draft', 'license_suspended', 'license_terminated',
      'license_not_started', 'license_expired'
    ))
  ),
  constraint ck_provisioning_runs_revision check (revision > 0),
  constraint ck_provisioning_runs_timestamps check (
    isfinite(created_at) and isfinite(updated_at) and updated_at >= created_at
    and (finished_at is null or (isfinite(finished_at) and finished_at >= created_at))
  ),
  constraint ck_provisioning_runs_finished check (
    (status in ('succeeded', 'cancelled')) = (finished_at is not null)
  ),
  constraint ck_provisioning_runs_succeeded_results check (
    status <> 'succeeded' or (
      result_supabase_project_ref is not null
      and result_hosting_region is not null
      and result_application_url is not null
    )
  ),
  -- Same formats as the Installation metadata they describe.
  constraint ck_provisioning_runs_result_project_ref check (
    result_supabase_project_ref is null
    or (
      result_supabase_project_ref = btrim(result_supabase_project_ref)
      and char_length(result_supabase_project_ref) between 1 and 64
      and result_supabase_project_ref ~ '^[a-z0-9]+$'
    )
  ),
  constraint ck_provisioning_runs_result_hosting_region check (
    result_hosting_region is null
    or (
      result_hosting_region = btrim(result_hosting_region)
      and char_length(result_hosting_region) between 1 and 64
      and result_hosting_region ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
  ),
  constraint ck_provisioning_runs_result_application_url check (
    result_application_url is null
    or (
      result_application_url = btrim(result_application_url)
      and char_length(result_application_url) between 9 and 2048
      and result_application_url !~ '[[:space:]]'
      and result_application_url !~ '#'
      and result_application_url ~
        '^https://[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]{1,5})?(?:[/?][^#[:space:]]*)?$'
      and split_part(
        split_part(substring(result_application_url from 9), '/', 1),
        '?',
        1
      ) !~ '@'
    )
  )
);

create unique index idx_provisioning_runs_installation_open_unique
  on public.provisioning_runs (installation_id)
  where status not in ('succeeded', 'cancelled');
create index idx_provisioning_runs_installation_created
  on public.provisioning_runs (installation_id, created_at desc, id desc);
create index idx_provisioning_runs_created_at_id
  on public.provisioning_runs (created_at desc, id desc);

create table public.provisioning_run_steps (
  run_id uuid not null,
  step_key text not null,
  position smallint not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  completed_at timestamptz,
  constraint pk_provisioning_run_steps primary key (run_id, step_key),
  constraint uq_provisioning_run_steps_position unique (run_id, position),
  constraint fk_provisioning_run_steps_run_id foreign key (run_id)
    references public.provisioning_runs(id) on delete restrict,
  constraint ck_provisioning_run_steps_catalog check (
    (step_key, position) in (
      ('supabase_project', 1::smallint),
      ('database_schema', 2::smallint),
      ('application_deployment', 3::smallint),
      ('installation_verification', 4::smallint)
    )
  ),
  constraint ck_provisioning_run_steps_status check (status in (
    'pending', 'in_progress', 'succeeded', 'failed'
  )),
  constraint ck_provisioning_run_steps_attempt_count check (
    attempt_count >= 0 and (status = 'pending' or attempt_count > 0)
  ),
  constraint ck_provisioning_run_steps_completed check (
    (status = 'succeeded') = (completed_at is not null)
    and (completed_at is null or isfinite(completed_at))
  )
);

create table public.provisioning_step_attempts (
  id uuid not null default gen_random_uuid(),
  run_id uuid not null,
  step_key text not null,
  attempt_number integer not null,
  started_at timestamptz not null default current_timestamp,
  started_revision bigint not null,
  outcome text,
  finished_at timestamptz,
  finished_revision bigint,
  failure_category text,
  blocked_reason text,
  note text,
  constraint pk_provisioning_step_attempts primary key (id),
  constraint fk_provisioning_step_attempts_step foreign key (run_id, step_key)
    references public.provisioning_run_steps(run_id, step_key) on delete restrict,
  constraint uq_provisioning_step_attempts_number unique (run_id, step_key, attempt_number),
  -- Each mutation creates at most one attempt, so the start revision is unique.
  constraint uq_provisioning_step_attempts_started_revision unique (run_id, started_revision),
  constraint ck_provisioning_step_attempts_numbers check (
    attempt_number > 0 and started_revision > 0
  ),
  constraint ck_provisioning_step_attempts_outcome check (
    outcome is null or outcome in ('succeeded', 'failed', 'blocked', 'cancelled')
  ),
  constraint ck_provisioning_step_attempts_finish check (
    (outcome is null) = (finished_at is null)
    and (outcome is null) = (finished_revision is null)
    and isfinite(started_at)
    and (finished_at is null or (isfinite(finished_at) and finished_at >= started_at))
    and (finished_revision is null or finished_revision >= started_revision)
    and (outcome is distinct from 'blocked' or (
      finished_at = started_at and finished_revision = started_revision
    ))
    and (outcome is null or outcome = 'blocked' or finished_revision > started_revision)
  ),
  constraint ck_provisioning_step_attempts_failure_category check (
    (outcome = 'failed') = (failure_category is not null)
    and (failure_category is null or failure_category in (
      'provider_error', 'configuration_error', 'permission_error',
      'quota_or_billing', 'timeout', 'verification_failed', 'other'
    ))
  ),
  constraint ck_provisioning_step_attempts_blocked_reason check (
    (outcome = 'blocked') = (blocked_reason is not null)
    and (blocked_reason is null or blocked_reason in (
      'installation_not_available', 'tenant_not_available', 'license_missing',
      'license_draft', 'license_suspended', 'license_terminated',
      'license_not_started', 'license_expired'
    ))
  ),
  -- Optional operator note: trimmed, 1-500 code points, no control
  -- characters except newline, only on succeeded or failed outcomes.
  constraint ck_provisioning_step_attempts_note check (
    note is null or (
      outcome in ('succeeded', 'failed')
      and note = btrim(note)
      and char_length(note) between 1 and 500
      and note !~ '[\x01-\x09\x0b-\x1f\x7f]'
    )
  )
);

create unique index idx_provisioning_step_attempts_one_open
  on public.provisioning_step_attempts (run_id) where outcome is null;
create index idx_provisioning_step_attempts_run_started
  on public.provisioning_step_attempts (run_id, started_at desc, id desc);

create table public.provisioning_audit_events (
  id uuid not null default gen_random_uuid(),
  run_id uuid not null,
  event_type text not null,
  step_key text,
  attempt_number integer,
  actor_user_id uuid not null,
  occurred_at timestamptz not null default current_timestamp,
  revision_before bigint,
  revision_after bigint not null,
  correlation_id uuid,
  constraint pk_provisioning_audit_events primary key (id),
  constraint fk_provisioning_audit_events_run_id foreign key (run_id)
    references public.provisioning_runs(id) on delete restrict,
  constraint uq_provisioning_audit_events_run_revision unique (run_id, revision_after),
  constraint ck_provisioning_audit_events_event_type check (event_type in (
    'run_requested', 'step_started', 'step_blocked', 'step_succeeded',
    'step_failed', 'run_succeeded', 'run_cancelled'
  )),
  constraint ck_provisioning_audit_events_revisions check (
    revision_after > 0 and (
      (event_type = 'run_requested' and revision_before is null and revision_after = 1)
      or (event_type <> 'run_requested' and revision_before is not null
        and revision_before > 0 and revision_before = revision_after - 1)
    )
  ),
  constraint ck_provisioning_audit_events_step check (
    (event_type in ('run_requested', 'run_cancelled'))
      = (step_key is null and attempt_number is null)
    and (step_key is null or step_key in (
      'supabase_project', 'database_schema', 'application_deployment',
      'installation_verification'
    ))
    and (step_key is null) = (attempt_number is null)
    and (attempt_number is null or attempt_number > 0)
    and (event_type <> 'run_succeeded' or step_key = 'installation_verification')
  ),
  constraint ck_provisioning_audit_events_occurred_at check (isfinite(occurred_at))
);
create index idx_provisioning_audit_events_run_occurred
  on public.provisioning_audit_events (run_id, occurred_at desc, id desc);

-- Structural immutability. Business transitions belong to F2E5 RPCs.
create function public.guard_provisioning_run_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  if TG_OP <> 'UPDATE' then
    raise exception using errcode = '55000', message = 'provisioning runs cannot be deleted';
  end if;
  if OLD.status in ('succeeded', 'cancelled')
    or NEW.id is distinct from OLD.id
    or NEW.installation_id is distinct from OLD.installation_id
    or NEW.catalog_version is distinct from OLD.catalog_version
    or NEW.created_at is distinct from OLD.created_at
    or NEW.created_by is distinct from OLD.created_by
    or (OLD.result_supabase_project_ref is not null
      and NEW.result_supabase_project_ref is distinct from OLD.result_supabase_project_ref)
    or (OLD.result_hosting_region is not null
      and NEW.result_hosting_region is distinct from OLD.result_hosting_region)
    or (OLD.result_application_url is not null
      and NEW.result_application_url is distinct from OLD.result_application_url)
  then
    raise exception using errcode = '55000', message = 'provisioning run identity, results and terminal state are immutable';
  end if;
  return NEW;
end;
$function$;

create function public.guard_provisioning_run_step_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  if TG_OP <> 'UPDATE' then
    raise exception using errcode = '55000', message = 'provisioning run steps cannot be deleted';
  end if;
  if OLD.status = 'succeeded'
    or NEW.run_id is distinct from OLD.run_id
    or NEW.step_key is distinct from OLD.step_key
    or NEW.position is distinct from OLD.position
    or NEW.attempt_count < OLD.attempt_count
  then
    raise exception using errcode = '55000', message = 'provisioning step identity and completion are immutable';
  end if;
  return NEW;
end;
$function$;

-- Append-only with exactly one finalization: an open attempt may set its
-- outcome fields once, nothing else ever changes.
create function public.guard_provisioning_step_attempt_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  if TG_OP <> 'UPDATE' then
    raise exception using errcode = '55000', message = 'provisioning step attempts are append-only';
  end if;
  if OLD.outcome is not null
    or NEW.outcome is null
    or NEW.id is distinct from OLD.id
    or NEW.run_id is distinct from OLD.run_id
    or NEW.step_key is distinct from OLD.step_key
    or NEW.attempt_number is distinct from OLD.attempt_number
    or NEW.started_at is distinct from OLD.started_at
    or NEW.started_revision is distinct from OLD.started_revision
  then
    raise exception using errcode = '55000', message = 'provisioning step attempts finalize exactly once';
  end if;
  return NEW;
end;
$function$;

create function public.prevent_provisioning_audit_event_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'provisioning audit events are append-only';
end;
$function$;

-- Deferred final-state check of one run graph. Re-reads committed-to-be state
-- under the parent row lock, never repairs, writes or checks business actors.
create function public.enforce_provisioning_run_integrity()
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
    -- Exactly the four catalog steps.
    or (select count(*) from public.provisioning_run_steps where run_id = run_row.id) <> 4
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
          where f.run_id = run_row.id and f.status <> 'succeeded'), 5)
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

alter function public.guard_provisioning_run_modification() owner to postgres;
alter function public.guard_provisioning_run_step_modification() owner to postgres;
alter function public.guard_provisioning_step_attempt_modification() owner to postgres;
alter function public.prevent_provisioning_audit_event_modification() owner to postgres;
alter function public.enforce_provisioning_run_integrity() owner to postgres;
revoke all privileges on function public.guard_provisioning_run_modification() from public, anon, authenticated, service_role;
revoke all privileges on function public.guard_provisioning_run_step_modification() from public, anon, authenticated, service_role;
revoke all privileges on function public.guard_provisioning_step_attempt_modification() from public, anon, authenticated, service_role;
revoke all privileges on function public.prevent_provisioning_audit_event_modification() from public, anon, authenticated, service_role;
revoke all privileges on function public.enforce_provisioning_run_integrity() from public, anon, authenticated, service_role;

create trigger trg_provisioning_runs_guard
before update or delete on public.provisioning_runs
for each row execute function public.guard_provisioning_run_modification();
create trigger trg_provisioning_runs_prevent_truncate
before truncate on public.provisioning_runs
for each statement execute function public.guard_provisioning_run_modification();

create trigger trg_provisioning_run_steps_guard
before update or delete on public.provisioning_run_steps
for each row execute function public.guard_provisioning_run_step_modification();
create trigger trg_provisioning_run_steps_prevent_truncate
before truncate on public.provisioning_run_steps
for each statement execute function public.guard_provisioning_run_step_modification();

create trigger trg_provisioning_step_attempts_guard
before update or delete on public.provisioning_step_attempts
for each row execute function public.guard_provisioning_step_attempt_modification();
create trigger trg_provisioning_step_attempts_prevent_truncate
before truncate on public.provisioning_step_attempts
for each statement execute function public.guard_provisioning_step_attempt_modification();

create trigger trg_provisioning_audit_events_append_only
before update or delete on public.provisioning_audit_events
for each row execute function public.prevent_provisioning_audit_event_modification();
create trigger trg_provisioning_audit_events_prevent_truncate
before truncate on public.provisioning_audit_events
for each statement execute function public.prevent_provisioning_audit_event_modification();

create constraint trigger trg_provisioning_runs_integrity
after insert or update on public.provisioning_runs
deferrable initially deferred
for each row execute function public.enforce_provisioning_run_integrity();
create constraint trigger trg_provisioning_run_steps_integrity
after insert or update on public.provisioning_run_steps
deferrable initially deferred
for each row execute function public.enforce_provisioning_run_integrity();
create constraint trigger trg_provisioning_step_attempts_integrity
after insert or update on public.provisioning_step_attempts
deferrable initially deferred
for each row execute function public.enforce_provisioning_run_integrity();
create constraint trigger trg_provisioning_audit_events_integrity
after insert on public.provisioning_audit_events
deferrable initially deferred
for each row execute function public.enforce_provisioning_run_integrity();

comment on table public.provisioning_runs is
  'F2E3: one provisioning run per installation attempt series; Provisioning-owned results. Installation is never written. No API access until F2E4/F2E5.';
comment on column public.provisioning_runs.installation_id is
  'Immutable installation relation; tenant is derived through it, never duplicated.';
comment on column public.provisioning_runs.revision is
  'Positive revision equal to the final contiguous audit maximum.';
comment on table public.provisioning_run_steps is
  'Catalog v1 steps created with the run; completion is final and in catalog order.';
comment on table public.provisioning_step_attempts is
  'Append-only attempts; an open attempt finalizes exactly once. Notes are operator text and must never contain secrets.';
comment on table public.provisioning_audit_events is
  'Append-only metadata audit: events, step and attempt numbers, revisions, actor and correlation. No values, notes or categories.';
comment on function public.enforce_provisioning_run_integrity() is
  'Deferred final-state structural check under the run NO KEY UPDATE lock. No writes, repair or business authorization. No direct API execution.';

alter table public.provisioning_runs enable row level security;
alter table public.provisioning_runs force row level security;
alter table public.provisioning_run_steps enable row level security;
alter table public.provisioning_run_steps force row level security;
alter table public.provisioning_step_attempts enable row level security;
alter table public.provisioning_step_attempts force row level security;
alter table public.provisioning_audit_events enable row level security;
alter table public.provisioning_audit_events force row level security;

revoke all privileges on table public.provisioning_runs, public.provisioning_run_steps,
  public.provisioning_step_attempts, public.provisioning_audit_events
  from public, anon, authenticated, service_role;

commit;
