begin;

-- F2E7: stale provisioning runs become visible in the list. Adds the open
-- step, its attempt start, a derived 24-hour staleness flag, the evaluation
-- time and an optional stale-only filter. Staleness stays derived and is never
-- stored. The return type changes, so the F2E4 function is replaced. No caller
-- exists yet (the server layer follows in F2E8).

drop function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean);

create function public.list_provisioning_runs(
  p_page_size integer default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_installation_id uuid default null,
  p_tenant_id uuid default null,
  p_status text default null,
  p_include_closed boolean default false,
  p_only_stale boolean default false
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
  open_step_key text,
  open_attempt_started_at timestamptz,
  is_stale boolean,
  revision bigint,
  created_at timestamptz,
  updated_at timestamptz,
  finished_at timestamptz,
  evaluated_at timestamptz,
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
declare
  evaluation_time timestamptz;
begin
  if not coalesce(public.is_provisioning_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_page_size is null
    or p_page_size not between 1 and 100
    or p_include_closed is null
    or p_only_stale is null
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_created_at is not null and not isfinite(p_cursor_created_at))
    or (p_status is not null and p_status not in (
      'pending', 'in_progress', 'blocked', 'failed', 'succeeded', 'cancelled'))
    or (p_status in ('succeeded', 'cancelled') and not p_include_closed)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  -- The cursor is bound to its immutable identity and installation/tenant
  -- filters. Status and staleness membership may change between pages.
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

  evaluation_time := statement_timestamp();
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
      open_attempt.step_key as open_step_key,
      open_attempt.started_at as open_attempt_started_at,
      -- Derived reminder only (24 hours, F2E2), nothing is stored or changed.
      coalesce(open_attempt.started_at < evaluation_time - interval '24 hours', false) as is_stale,
      run.revision,
      run.created_at,
      run.updated_at,
      run.finished_at
    from public.provisioning_runs as run
    inner join public.installations as installation
      on installation.id = run.installation_id
    inner join public.tenants as tenant
      on tenant.id = installation.tenant_id
    left join public.provisioning_step_attempts as open_attempt
      on open_attempt.run_id = run.id and open_attempt.outcome is null
    where (p_installation_id is null or run.installation_id = p_installation_id)
      and (p_tenant_id is null or installation.tenant_id = p_tenant_id)
      and (p_status is null or run.status = p_status)
      and (p_include_closed or run.status not in ('succeeded', 'cancelled'))
      and (
        not p_only_stale
        or open_attempt.started_at < evaluation_time - interval '24 hours'
      )
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
    page.open_step_key,
    page.open_attempt_started_at,
    page.is_stale,
    page.revision,
    page.created_at,
    page.updated_at,
    page.finished_at,
    evaluation_time,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_created_at end,
    case when metadata.page_has_more then metadata.cursor_id end
  from numbered_runs as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.created_at desc, page.id desc;
end;
$function$;

alter function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean,boolean) owner to postgres;
comment on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean,boolean) is
  'F2E4/F2E7: owner+AAL2 run list, created_at/id DESC keyset, installation/tenant/status filters, closed runs hidden by default, derived 24-hour staleness with optional stale-only filter.';
revoke all privileges on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean,boolean) from public, anon, authenticated, service_role;
grant execute on function public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean,boolean) to authenticated;

commit;
