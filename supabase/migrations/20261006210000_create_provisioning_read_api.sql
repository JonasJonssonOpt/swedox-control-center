begin;

-- F2E4: Provisioning owner+AAL2 read API. Tables stay without any API grant
-- or policy, so these SECURITY DEFINER RPCs are the only read path. STABLE
-- plpgsql reads one caller snapshot. statement_timestamp() is the evaluation
-- time, as in Licensing F2D6.

-- Domain-owned copy of the Licensing predicate so the domains stay
-- independent. Called only inside definer RPCs, so no API role executes it.
create function public.is_provisioning_owner_aal2()
returns boolean
language plpgsql
stable
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  return coalesce(
    auth.uid() is not null
    and public.is_control_center_owner()
    and (auth.jwt() -> 'aal') = '"aal2"'::jsonb,
    false
  );
exception
  -- Malformed request JSON or subject must deny, never fall back.
  when invalid_text_representation then
    return false;
end;
$function$;

create function public.list_provisioning_runs(
  p_page_size integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_installation_id uuid default null,
  p_tenant_id uuid default null,
  p_status text default null,
  p_include_closed boolean default false
)
returns table (
  id uuid,
  installation_id uuid,
  installation_display_name text,
  installation_code text,
  tenant_id uuid,
  tenant_legal_name text,
  status text,
  blocked_reason text,
  next_step_key text,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz,
  finished_at timestamptz,
  has_more boolean,
  next_cursor_created_at timestamptz,
  next_cursor_id uuid
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_page_size is null
    or p_page_size not between 1 and 100
    or p_include_closed is null
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_created_at is not null and not isfinite(p_cursor_created_at))
    or (p_status is not null and p_status not in (
      'pending', 'in_progress', 'blocked', 'failed', 'succeeded', 'cancelled'))
    or (p_status in ('succeeded', 'cancelled') and not p_include_closed)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  -- The cursor is bound to its immutable identity and installation/tenant
  -- filters. Status membership may change between pages.
  if p_cursor_id is not null and not exists (
    select 1
    from public.provisioning_runs as cursor_run
    inner join public.installations as cursor_installation
      on cursor_installation.id = cursor_run.installation_id
    where cursor_run.id = p_cursor_id
      and cursor_run.created_at = p_cursor_created_at
      and (p_installation_id is null or cursor_run.installation_id = p_installation_id)
      and (p_tenant_id is null or cursor_installation.tenant_id = p_tenant_id)
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_runs as materialized (
    select
      run.id,
      run.installation_id,
      installation.display_name as installation_display_name,
      installation.installation_code,
      installation.tenant_id,
      tenant.legal_name as tenant_legal_name,
      run.status,
      run.blocked_reason,
      (
        select step.step_key
        from public.provisioning_run_steps as step
        where step.run_id = run.id and step.status <> 'succeeded'
        order by step.position
        limit 1
      ) as next_step_key,
      run.revision,
      run.created_at,
      run.updated_at,
      run.finished_at
    from public.provisioning_runs as run
    inner join public.installations as installation
      on installation.id = run.installation_id
    inner join public.tenants as tenant
      on tenant.id = installation.tenant_id
    where (p_installation_id is null or run.installation_id = p_installation_id)
      and (p_tenant_id is null or installation.tenant_id = p_tenant_id)
      and (p_status is null or run.status = p_status)
      and (p_include_closed or run.status not in ('succeeded', 'cancelled'))
      and (
        p_cursor_id is null
        or (run.created_at, run.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by run.created_at desc, run.id desc
    limit p_page_size + 1
  ),
  numbered_runs as (
    select
      candidate.*,
      row_number() over (
        order by candidate.created_at desc, candidate.id desc
      ) as page_position
    from candidate_runs as candidate
  ),
  page_metadata as (
    select
      count(*) > p_page_size as page_has_more,
      max(numbered.created_at)
        filter (where numbered.page_position = p_page_size) as cursor_created_at,
      (
        array_agg(numbered.id)
          filter (where numbered.page_position = p_page_size)
      )[1] as cursor_id
    from numbered_runs as numbered
  )
  select
    page.id,
    page.installation_id,
    page.installation_display_name,
    page.installation_code,
    page.tenant_id,
    page.tenant_legal_name,
    page.status,
    page.blocked_reason,
    page.next_step_key,
    page.revision,
    page.created_at,
    page.updated_at,
    page.finished_at,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_created_at end,
    case when metadata.page_has_more then metadata.cursor_id end
  from numbered_runs as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.created_at desc, page.id desc;
end;
$function$;

-- One row per catalog step (exactly four), run fields repeated on each row.
create function public.get_provisioning_run(p_run_id uuid)
returns table (
  id uuid,
  installation_id uuid,
  installation_display_name text,
  installation_code text,
  installation_environment text,
  tenant_id uuid,
  tenant_legal_name text,
  catalog_version integer,
  status text,
  blocked_reason text,
  result_supabase_project_ref text,
  result_hosting_region text,
  result_application_url text,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz,
  finished_at timestamptz,
  step_key text,
  step_position smallint,
  step_status text,
  step_attempt_count integer,
  step_completed_at timestamptz,
  open_attempt_number integer,
  open_attempt_started_at timestamptz,
  is_stale boolean,
  evaluated_at timestamptz
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  evaluation_time timestamptz;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.provisioning_runs as run where run.id = p_run_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  evaluation_time := statement_timestamp();
  return query
  select
    run.id,
    run.installation_id,
    installation.display_name,
    installation.installation_code,
    installation.environment,
    installation.tenant_id,
    tenant.legal_name,
    run.catalog_version,
    run.status,
    run.blocked_reason,
    run.result_supabase_project_ref,
    run.result_hosting_region,
    run.result_application_url,
    run.revision,
    run.created_at,
    run.updated_at,
    run.finished_at,
    step.step_key,
    step.position,
    step.status,
    step.attempt_count,
    step.completed_at,
    open_attempt.attempt_number,
    open_attempt.started_at,
    -- Derived reminder only (24 hours, F2E2), nothing is stored or changed.
    coalesce(open_attempt.started_at < evaluation_time - interval '24 hours', false),
    evaluation_time
  from public.provisioning_runs as run
  inner join public.installations as installation
    on installation.id = run.installation_id
  inner join public.tenants as tenant
    on tenant.id = installation.tenant_id
  inner join public.provisioning_run_steps as step
    on step.run_id = run.id
  left join public.provisioning_step_attempts as open_attempt
    on open_attempt.run_id = step.run_id
    and open_attempt.step_key = step.step_key
    and open_attempt.outcome is null
  where run.id = p_run_id
  order by step.position;
end;
$function$;

create function public.list_provisioning_step_attempts(
  p_run_id uuid,
  p_page_size integer default 25,
  p_cursor_started_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  run_id uuid,
  step_key text,
  attempt_number integer,
  started_at timestamptz,
  started_revision bigint,
  outcome text,
  finished_at timestamptz,
  finished_revision bigint,
  failure_category text,
  blocked_reason text,
  note text,
  has_more boolean,
  next_cursor_started_at timestamptz,
  next_cursor_id uuid
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null
    or p_page_size is null
    or p_page_size not between 1 and 100
    or (p_cursor_started_at is null) <> (p_cursor_id is null)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.provisioning_runs as run where run.id = p_run_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_cursor_id is not null and not exists (
    select 1 from public.provisioning_step_attempts as cursor_attempt
    where cursor_attempt.run_id = p_run_id
      and cursor_attempt.started_at = p_cursor_started_at
      and cursor_attempt.id = p_cursor_id
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_attempts as materialized (
    select
      attempt.id,
      attempt.run_id,
      attempt.step_key,
      attempt.attempt_number,
      attempt.started_at,
      attempt.started_revision,
      attempt.outcome,
      attempt.finished_at,
      attempt.finished_revision,
      attempt.failure_category,
      attempt.blocked_reason,
      attempt.note
    from public.provisioning_step_attempts as attempt
    where attempt.run_id = p_run_id
      and (
        p_cursor_id is null
        or (attempt.started_at, attempt.id) < (p_cursor_started_at, p_cursor_id)
      )
    order by attempt.started_at desc, attempt.id desc
    limit p_page_size + 1
  ),
  numbered_attempts as (
    select
      candidate.*,
      row_number() over (
        order by candidate.started_at desc, candidate.id desc
      ) as page_position
    from candidate_attempts as candidate
  ),
  page_metadata as (
    select
      count(*) > p_page_size as page_has_more,
      max(numbered.started_at)
        filter (where numbered.page_position = p_page_size) as cursor_started_at,
      (
        array_agg(numbered.id)
          filter (where numbered.page_position = p_page_size)
      )[1] as cursor_id
    from numbered_attempts as numbered
  )
  select
    page.id,
    page.run_id,
    page.step_key,
    page.attempt_number,
    page.started_at,
    page.started_revision,
    page.outcome,
    page.finished_at,
    page.finished_revision,
    page.failure_category,
    page.blocked_reason,
    page.note,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_started_at end,
    case when metadata.page_has_more then metadata.cursor_id end
  from numbered_attempts as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.started_at desc, page.id desc;
end;
$function$;

create function public.list_provisioning_audit_events(
  p_run_id uuid,
  p_page_size integer default 25,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  run_id uuid,
  event_type text,
  step_key text,
  attempt_number integer,
  actor_user_id uuid,
  occurred_at timestamptz,
  revision_before bigint,
  revision_after bigint,
  correlation_id uuid,
  has_more boolean,
  next_cursor_occurred_at timestamptz,
  next_cursor_id uuid
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_run_id is null
    or p_page_size is null
    or p_page_size not between 1 and 100
    or (p_cursor_occurred_at is null) <> (p_cursor_id is null)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.provisioning_runs as run where run.id = p_run_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_cursor_id is not null and not exists (
    select 1 from public.provisioning_audit_events as cursor_event
    where cursor_event.run_id = p_run_id
      and cursor_event.occurred_at = p_cursor_occurred_at
      and cursor_event.id = p_cursor_id
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_events as materialized (
    select
      audit.id,
      audit.run_id,
      audit.event_type,
      audit.step_key,
      audit.attempt_number,
      audit.actor_user_id,
      audit.occurred_at,
      audit.revision_before,
      audit.revision_after,
      audit.correlation_id
    from public.provisioning_audit_events as audit
    where audit.run_id = p_run_id
      and (
        p_cursor_id is null
        or (audit.occurred_at, audit.id) < (p_cursor_occurred_at, p_cursor_id)
      )
    order by audit.occurred_at desc, audit.id desc
    limit p_page_size + 1
  ),
  numbered_events as (
    select
      candidate.*,
      row_number() over (
        order by candidate.occurred_at desc, candidate.id desc
      ) as page_position
    from candidate_events as candidate
  ),
  page_metadata as (
    select
      count(*) > p_page_size as page_has_more,
      max(numbered.occurred_at)
        filter (where numbered.page_position = p_page_size) as cursor_occurred_at,
      (
        array_agg(numbered.id)
          filter (where numbered.page_position = p_page_size)
      )[1] as cursor_id
    from numbered_events as numbered
  )
  select
    page.id,
    page.run_id,
    page.event_type,
    page.step_key,
    page.attempt_number,
    page.actor_user_id,
    page.occurred_at,
    page.revision_before,
    page.revision_after,
    page.correlation_id,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_occurred_at end,
    case when metadata.page_has_more then metadata.cursor_id end
  from numbered_events as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.occurred_at desc, page.id desc;
end;
$function$;

alter function public.is_provisioning_owner_aal2() owner to postgres;
alter function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean) owner to postgres;
alter function public.get_provisioning_run(uuid) owner to postgres;
alter function public.list_provisioning_step_attempts(uuid,integer,timestamptz,uuid) owner to postgres;
alter function public.list_provisioning_audit_events(uuid,integer,timestamptz,uuid) owner to postgres;

comment on function public.is_provisioning_owner_aal2() is
  'F2E4: Provisioning-owned predicate, existing singleton owner and exact top-level JWT aal2. Executed only inside definer RPCs, no API grant.';
comment on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean) is
  'F2E4: owner+AAL2 run list, created_at/id DESC keyset, installation/tenant/status filters, closed runs hidden by default.';
comment on function public.get_provisioning_run(uuid) is
  'F2E4: owner+AAL2 run detail, one row per catalog step with derived 24-hour staleness of the open attempt.';
comment on function public.list_provisioning_step_attempts(uuid,integer,timestamptz,uuid) is
  'F2E4: owner+AAL2 run-bound attempt history, started_at/id DESC keyset, including operator notes.';
comment on function public.list_provisioning_audit_events(uuid,integer,timestamptz,uuid) is
  'F2E4: owner+AAL2 run-bound metadata audit, occurred_at/id DESC keyset. The audit table stays closed.';

revoke all privileges on function public.is_provisioning_owner_aal2() from public, anon, authenticated, service_role;
revoke all privileges on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all privileges on function public.get_provisioning_run(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.list_provisioning_step_attempts(uuid,integer,timestamptz,uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.list_provisioning_audit_events(uuid,integer,timestamptz,uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.get_provisioning_run(uuid) to authenticated;
grant execute on function public.list_provisioning_step_attempts(uuid,integer,timestamptz,uuid) to authenticated;
grant execute on function public.list_provisioning_audit_events(uuid,integer,timestamptz,uuid) to authenticated;

commit;
