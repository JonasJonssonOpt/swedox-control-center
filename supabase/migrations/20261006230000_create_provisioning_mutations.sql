begin;

-- F2E5: Provisioning mutations and state machine (F2E2 contract, five-step
-- catalog). Every RPC: owner+AAL2, actor from auth.uid(), locks
-- Installation -> Tenant (FOR KEY SHARE) -> run (FOR NO KEY UPDATE), one
-- clock_timestamp() decision time after the locks, expected revision before
-- state, revision +1 and exactly one audit event. A blocked step start is a
-- successful call that records the blocked attempt and its reason.

-- Internal precondition check, in order installation, tenant, license.
-- Licensing eligibility is consumed through its published contract in the
-- same transaction and never duplicated. NULL means no block.
create function public.provisioning_block_reason(
  p_installation public.installations,
  p_tenant public.tenants
)
returns text
language plpgsql
stable
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
declare
  eligibility_reason text;
begin
  if p_installation.archived_at is not null
    or p_installation.administrative_status not in ('planned', 'active')
  then
    return 'installation_not_available';
  end if;
  if p_tenant.operational_status <> 'active' or p_tenant.archived_at is not null then
    return 'tenant_not_available';
  end if;

  select eligibility.reason into eligibility_reason
  from public.get_license_provisioning_eligibility(p_tenant.id, p_installation.id) as eligibility;

  return case eligibility_reason
    when 'eligible' then null
    when 'missing_license' then 'license_missing'
    when 'draft' then 'license_draft'
    when 'suspended' then 'license_suspended'
    when 'terminated' then 'license_terminated'
    when 'not_started' then 'license_not_started'
    when 'expired' then 'license_expired'
    when 'tenant_unavailable' then 'tenant_not_available'
    -- A mismatch or unknown result is impossible here and must never pass.
    else 'eligibility_unavailable'
  end;
end;
$function$;

create function public.request_provisioning_run(
  p_installation_id uuid,
  p_correlation_id uuid default null
)
returns public.provisioning_runs
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  target_installation public.installations;
  target_tenant public.tenants;
  decision_time timestamptz;
  block_reason text;
  created_run public.provisioning_runs;
  violated_constraint text;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_installation_id is null then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into target_installation from public.installations as installation
  where installation.id = p_installation_id for key share;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into target_tenant from public.tenants as tenant
  where tenant.id = target_installation.tenant_id for key share;

  decision_time := clock_timestamp();
  block_reason := public.provisioning_block_reason(target_installation, target_tenant);
  if block_reason = 'eligibility_unavailable' then
    raise exception using errcode = 'P0001', message = 'eligibility_unavailable';
  elsif block_reason = 'installation_not_available' then
    raise exception using errcode = 'P0001', message = 'installation_not_available';
  elsif block_reason = 'tenant_not_available' then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  elsif block_reason is not null then
    raise exception using errcode = 'P0001', message = 'license_not_eligible';
  end if;

  if exists (
    select 1 from public.provisioning_runs as run
    where run.installation_id = p_installation_id
      and run.status not in ('succeeded', 'cancelled')
  ) then
    raise exception using errcode = 'P0001', message = 'duplicate_run';
  end if;

  begin
    insert into public.provisioning_runs(
      installation_id, created_at, created_by, updated_at, updated_by
    ) values (
      p_installation_id, decision_time, actor_id, decision_time, actor_id
    ) returning * into created_run;
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'idx_provisioning_runs_installation_open_unique' then
      raise exception using errcode = 'P0001', message = 'duplicate_run';
    end if;
    raise;
  end;

  insert into public.provisioning_run_steps(run_id, step_key, position) values
    (created_run.id, 'supabase_project', 1),
    (created_run.id, 'database_schema', 2),
    (created_run.id, 'application_deployment', 3),
    (created_run.id, 'initial_administrator', 4),
    (created_run.id, 'installation_verification', 5);

  begin
    insert into public.provisioning_audit_events(
      run_id, event_type, actor_user_id, occurred_at, revision_after, correlation_id
    ) values (
      created_run.id, 'run_requested', actor_id, decision_time, 1, p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return created_run;
end;
$function$;

create function public.start_provisioning_step(
  p_run_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.provisioning_runs
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  run_installation_id uuid;
  target_installation public.installations;
  target_tenant public.tenants;
  current_run public.provisioning_runs;
  next_step public.provisioning_run_steps;
  decision_time timestamptz;
  block_reason text;
  new_revision bigint;
  attempt_no integer;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select run.installation_id into run_installation_id
  from public.provisioning_runs as run where run.id = p_run_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into target_installation from public.installations as installation
  where installation.id = run_installation_id for key share;
  select * into target_tenant from public.tenants as tenant
  where tenant.id = target_installation.tenant_id for key share;
  select * into current_run from public.provisioning_runs as run
  where run.id = p_run_id for no key update;

  decision_time := clock_timestamp();
  if current_run.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_run.status in ('succeeded', 'cancelled')
    or exists (
      select 1 from public.provisioning_step_attempts as attempt
      where attempt.run_id = current_run.id and attempt.outcome is null
    )
  then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  -- The next step is always derived: the first unfinished one in catalog order.
  select * into strict next_step from public.provisioning_run_steps as step
  where step.run_id = current_run.id and step.status <> 'succeeded'
  order by step.position limit 1;

  block_reason := public.provisioning_block_reason(target_installation, target_tenant);
  if block_reason = 'eligibility_unavailable' then
    raise exception using errcode = 'P0001', message = 'eligibility_unavailable';
  end if;
  new_revision := current_run.revision + 1;

  update public.provisioning_run_steps as step
  set attempt_count = step.attempt_count + 1,
    status = case when block_reason is null then 'in_progress' else 'pending' end
  where step.run_id = current_run.id and step.step_key = next_step.step_key
  returning step.attempt_count into attempt_no;

  insert into public.provisioning_step_attempts(
    run_id, step_key, attempt_number, started_at, started_revision,
    outcome, finished_at, finished_revision, blocked_reason
  ) values (
    current_run.id, next_step.step_key, attempt_no, decision_time, new_revision,
    case when block_reason is null then null else 'blocked' end,
    case when block_reason is null then null else decision_time end,
    case when block_reason is null then null else new_revision end,
    block_reason
  );

  update public.provisioning_runs as run
  set status = case when block_reason is null then 'in_progress' else 'blocked' end,
    blocked_reason = block_reason,
    revision = new_revision,
    updated_at = decision_time,
    updated_by = actor_id
  where run.id = current_run.id
  returning * into current_run;

  begin
    insert into public.provisioning_audit_events(
      run_id, event_type, step_key, attempt_number, actor_user_id, occurred_at,
      revision_before, revision_after, correlation_id
    ) values (
      current_run.id,
      case when block_reason is null then 'step_started' else 'step_blocked' end,
      next_step.step_key, attempt_no, actor_id, decision_time,
      new_revision - 1, new_revision, p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return current_run;
end;
$function$;

create function public.complete_provisioning_step(
  p_run_id uuid,
  p_expected_revision bigint,
  p_supabase_project_ref text default null,
  p_hosting_region text default null,
  p_application_url text default null,
  p_note text default null,
  p_correlation_id uuid default null
)
returns public.provisioning_runs
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  run_installation_id uuid;
  target_installation public.installations;
  current_run public.provisioning_runs;
  open_attempt public.provisioning_step_attempts;
  decision_time timestamptz;
  new_revision bigint;
  final_step boolean;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  -- Input shape is validated before any lock. Formats are enforced again by
  -- the table constraints.
  if p_run_id is null or p_expected_revision is null or p_expected_revision <= 0
    or (p_note is not null and (
      p_note <> btrim(p_note)
      or char_length(p_note) not between 1 and 500
      or p_note ~ '[\x01-\x09\x0b-\x1f\x7f]'
    ))
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select run.installation_id into run_installation_id
  from public.provisioning_runs as run where run.id = p_run_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into target_installation from public.installations as installation
  where installation.id = run_installation_id for key share;
  -- Lock only: these outcomes need no availability check.
  perform 1 from public.tenants as tenant
  where tenant.id = target_installation.tenant_id for key share;
  select * into current_run from public.provisioning_runs as run
  where run.id = p_run_id for no key update;

  decision_time := clock_timestamp();
  if current_run.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  select * into open_attempt from public.provisioning_step_attempts as attempt
  where attempt.run_id = current_run.id and attempt.outcome is null;
  if not found or current_run.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  -- Exactly the results owned by the open step, nothing else.
  if (open_attempt.step_key = 'supabase_project') is distinct from
      (p_supabase_project_ref is not null and p_hosting_region is not null)
    or (open_attempt.step_key <> 'supabase_project'
      and (p_supabase_project_ref is not null or p_hosting_region is not null))
    or (open_attempt.step_key = 'application_deployment') is distinct from
      (p_application_url is not null)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  new_revision := current_run.revision + 1;
  final_step := open_attempt.step_key = 'installation_verification';

  update public.provisioning_step_attempts as attempt
  set outcome = 'succeeded', finished_at = decision_time,
    finished_revision = new_revision, note = p_note
  where attempt.id = open_attempt.id;
  update public.provisioning_run_steps as step
  set status = 'succeeded', completed_at = decision_time
  where step.run_id = current_run.id and step.step_key = open_attempt.step_key;

  begin
    update public.provisioning_runs as run
    set status = case when final_step then 'succeeded' else 'in_progress' end,
      finished_at = case when final_step then decision_time end,
      result_supabase_project_ref = coalesce(p_supabase_project_ref, run.result_supabase_project_ref),
      result_hosting_region = coalesce(p_hosting_region, run.result_hosting_region),
      result_application_url = coalesce(p_application_url, run.result_application_url),
      revision = new_revision,
      updated_at = decision_time,
      updated_by = actor_id
    where run.id = current_run.id
    returning * into current_run;
  exception when check_violation then
    raise exception using errcode = '22023', message = 'validation_error';
  end;

  begin
    insert into public.provisioning_audit_events(
      run_id, event_type, step_key, attempt_number, actor_user_id, occurred_at,
      revision_before, revision_after, correlation_id
    ) values (
      current_run.id,
      case when final_step then 'run_succeeded' else 'step_succeeded' end,
      open_attempt.step_key, open_attempt.attempt_number, actor_id, decision_time,
      new_revision - 1, new_revision, p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return current_run;
end;
$function$;

create function public.fail_provisioning_step(
  p_run_id uuid,
  p_expected_revision bigint,
  p_failure_category text,
  p_note text default null,
  p_correlation_id uuid default null
)
returns public.provisioning_runs
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  run_installation_id uuid;
  target_installation public.installations;
  current_run public.provisioning_runs;
  open_attempt public.provisioning_step_attempts;
  decision_time timestamptz;
  new_revision bigint;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null or p_expected_revision is null or p_expected_revision <= 0
    or p_failure_category is null
    or p_failure_category not in (
      'provider_error', 'configuration_error', 'permission_error',
      'quota_or_billing', 'timeout', 'verification_failed', 'other'
    )
    or (p_note is not null and (
      p_note <> btrim(p_note)
      or char_length(p_note) not between 1 and 500
      or p_note ~ '[\x01-\x09\x0b-\x1f\x7f]'
    ))
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select run.installation_id into run_installation_id
  from public.provisioning_runs as run where run.id = p_run_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into target_installation from public.installations as installation
  where installation.id = run_installation_id for key share;
  -- Lock only: these outcomes need no availability check.
  perform 1 from public.tenants as tenant
  where tenant.id = target_installation.tenant_id for key share;
  select * into current_run from public.provisioning_runs as run
  where run.id = p_run_id for no key update;

  decision_time := clock_timestamp();
  if current_run.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  select * into open_attempt from public.provisioning_step_attempts as attempt
  where attempt.run_id = current_run.id and attempt.outcome is null;
  if not found or current_run.status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  new_revision := current_run.revision + 1;
  update public.provisioning_step_attempts as attempt
  set outcome = 'failed', finished_at = decision_time, finished_revision = new_revision,
    failure_category = p_failure_category, note = p_note
  where attempt.id = open_attempt.id;
  update public.provisioning_run_steps as step
  set status = 'failed'
  where step.run_id = current_run.id and step.step_key = open_attempt.step_key;
  update public.provisioning_runs as run
  set status = 'failed', revision = new_revision, updated_at = decision_time, updated_by = actor_id
  where run.id = current_run.id
  returning * into current_run;

  begin
    insert into public.provisioning_audit_events(
      run_id, event_type, step_key, attempt_number, actor_user_id, occurred_at,
      revision_before, revision_after, correlation_id
    ) values (
      current_run.id, 'step_failed', open_attempt.step_key, open_attempt.attempt_number,
      actor_id, decision_time, new_revision - 1, new_revision, p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return current_run;
end;
$function$;

create function public.cancel_provisioning_run(
  p_run_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.provisioning_runs
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  run_installation_id uuid;
  target_installation public.installations;
  current_run public.provisioning_runs;
  open_attempt public.provisioning_step_attempts;
  decision_time timestamptz;
  new_revision bigint;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select run.installation_id into run_installation_id
  from public.provisioning_runs as run where run.id = p_run_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into target_installation from public.installations as installation
  where installation.id = run_installation_id for key share;
  -- Lock only: these outcomes need no availability check.
  perform 1 from public.tenants as tenant
  where tenant.id = target_installation.tenant_id for key share;
  select * into current_run from public.provisioning_runs as run
  where run.id = p_run_id for no key update;

  decision_time := clock_timestamp();
  if current_run.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_run.status in ('succeeded', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  -- Cancelling never tears down resources. An open attempt is closed.
  new_revision := current_run.revision + 1;
  select * into open_attempt from public.provisioning_step_attempts as attempt
  where attempt.run_id = current_run.id and attempt.outcome is null;
  if found then
    update public.provisioning_step_attempts as attempt
    set outcome = 'cancelled', finished_at = decision_time, finished_revision = new_revision
    where attempt.id = open_attempt.id;
    update public.provisioning_run_steps as step
    set status = 'pending'
    where step.run_id = current_run.id and step.step_key = open_attempt.step_key;
  end if;
  update public.provisioning_runs as run
  set status = 'cancelled', blocked_reason = null, finished_at = decision_time,
    revision = new_revision, updated_at = decision_time, updated_by = actor_id
  where run.id = current_run.id
  returning * into current_run;

  begin
    insert into public.provisioning_audit_events(
      run_id, event_type, actor_user_id, occurred_at, revision_before, revision_after, correlation_id
    ) values (
      current_run.id, 'run_cancelled', actor_id, decision_time,
      new_revision - 1, new_revision, p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return current_run;
end;
$function$;

alter function public.provisioning_block_reason(public.installations, public.tenants) owner to postgres;
alter function public.request_provisioning_run(uuid, uuid) owner to postgres;
alter function public.start_provisioning_step(uuid, bigint, uuid) owner to postgres;
alter function public.complete_provisioning_step(uuid, bigint, text, text, text, text, uuid) owner to postgres;
alter function public.fail_provisioning_step(uuid, bigint, text, text, uuid) owner to postgres;
alter function public.cancel_provisioning_run(uuid, bigint, uuid) owner to postgres;

comment on function public.provisioning_block_reason(public.installations, public.tenants) is
  'F2E5 internal: installation, tenant then Licensing eligibility (published contract, same transaction). NULL means no block. No API grant.';
comment on function public.request_provisioning_run(uuid, uuid) is
  'F2E5: owner+AAL2 requests a run for an available installation, tenant and eligible license. One open run per installation (duplicate_run).';
comment on function public.start_provisioning_step(uuid, bigint, uuid) is
  'F2E5: starts the derived next step, or records a blocked attempt with its reason after re-checking installation, tenant and license.';
comment on function public.complete_provisioning_step(uuid, bigint, text, text, text, text, uuid) is
  'F2E5: records success of the open attempt with exactly the results its step owns. The final step completes the run.';
comment on function public.fail_provisioning_step(uuid, bigint, text, text, uuid) is
  'F2E5: records failure of the open attempt with a closed category and optional note. Manual retry via start.';
comment on function public.cancel_provisioning_run(uuid, bigint, uuid) is
  'F2E5: cancels a non-terminal run and closes an open attempt. Never tears down resources.';

revoke all privileges on function public.provisioning_block_reason(public.installations, public.tenants) from public, anon, authenticated, service_role;
revoke all privileges on function public.request_provisioning_run(uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.start_provisioning_step(uuid, bigint, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.complete_provisioning_step(uuid, bigint, text, text, text, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.fail_provisioning_step(uuid, bigint, text, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.cancel_provisioning_run(uuid, bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.request_provisioning_run(uuid, uuid) to authenticated;
grant execute on function public.start_provisioning_step(uuid, bigint, uuid) to authenticated;
grant execute on function public.complete_provisioning_step(uuid, bigint, text, text, text, text, uuid) to authenticated;
grant execute on function public.fail_provisioning_step(uuid, bigint, text, text, uuid) to authenticated;
grant execute on function public.cancel_provisioning_run(uuid, bigint, uuid) to authenticated;

commit;
