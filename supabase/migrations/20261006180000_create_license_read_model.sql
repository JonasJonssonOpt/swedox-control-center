begin;

-- F2D6: Licensing read model. Read-only owner+AAL2 RPCs with derived validity
-- at one DB evaluation time, keyset pagination and a metadata allowlist.
-- STABLE plpgsql uses the caller's snapshot for every statement, so each call
-- reads one consistent graph. No table, grant or write path changes.

create function public.list_licenses(
  p_page_size integer default 50,
  p_evaluated_at timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_tenant_id uuid default null,
  p_status text default null,
  p_validity text default null,
  p_include_terminated boolean default false,
  p_search text default null
)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_legal_name text,
  status text,
  validity text,
  plan_key text,
  plan_display_label text,
  max_active_users integer,
  valid_from timestamptz,
  valid_until timestamptz,
  revision bigint,
  current_terms_version bigint,
  created_at timestamptz,
  updated_at timestamptz,
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
  normalized_search text := nullif(btrim(p_search), '');
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_page_size is null
    or p_page_size not between 1 and 100
    or p_include_terminated is null
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or (p_cursor_id is null) <> (p_evaluated_at is null)
    or (p_evaluated_at is not null and not isfinite(p_evaluated_at))
    or (p_cursor_created_at is not null and not isfinite(p_cursor_created_at))
    or (p_status is not null and p_status not in ('draft', 'active', 'suspended', 'terminated'))
    or (p_status is not distinct from 'terminated' and not p_include_terminated)
    or (p_validity is not null and p_validity not in ('not_started', 'valid', 'expired'))
    or (normalized_search is not null and char_length(normalized_search) > 200)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  -- First page: the server issues the evaluation time. Continuation pages
  -- reuse it unchanged; a future time is never accepted.
  evaluation_time := coalesce(p_evaluated_at, statement_timestamp());
  if evaluation_time > statement_timestamp() then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  -- The cursor is bound to its immutable identity, tenant filter and series
  -- time. Mutable filter membership may change between pages by design.
  if p_cursor_id is not null and not exists (
    select 1
    from public.licenses as cursor_license
    where cursor_license.id = p_cursor_id
      and cursor_license.created_at = p_cursor_created_at
      and cursor_license.created_at <= evaluation_time
      and (p_tenant_id is null or cursor_license.tenant_id = p_tenant_id)
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_licenses as materialized (
    select
      license.id,
      license.tenant_id,
      tenant.legal_name as tenant_legal_name,
      license.status,
      derived.validity,
      terms.plan_key,
      terms.plan_display_label,
      terms.max_active_users,
      terms.valid_from,
      terms.valid_until,
      license.revision,
      license.current_terms_version,
      license.created_at,
      license.updated_at
    from public.licenses as license
    inner join public.tenants as tenant
      on tenant.id = license.tenant_id
    inner join public.license_terms_versions as terms
      on terms.license_id = license.id
      and terms.version = license.current_terms_version
    cross join lateral (
      select case
        when evaluation_time < terms.valid_from then 'not_started'
        when terms.valid_until is not null and evaluation_time >= terms.valid_until then 'expired'
        else 'valid'
      end as validity
    ) as derived
    where (p_tenant_id is null or license.tenant_id = p_tenant_id)
      and (p_status is null or license.status = p_status)
      and (p_include_terminated or license.status <> 'terminated')
      and (p_validity is null or derived.validity = p_validity)
      and (
        normalized_search is null
        or position(lower(normalized_search) in lower(tenant.legal_name)) > 0
      )
      and (
        p_cursor_id is null
        or (license.created_at, license.id) < (p_cursor_created_at, p_cursor_id)
      )
    order by license.created_at desc, license.id desc
    limit p_page_size + 1
  ),
  numbered_licenses as (
    select
      candidate.*,
      row_number() over (
        order by candidate.created_at desc, candidate.id desc
      ) as page_position
    from candidate_licenses as candidate
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
    from numbered_licenses as numbered
  )
  select
    page.id,
    page.tenant_id,
    page.tenant_legal_name,
    page.status,
    page.validity,
    page.plan_key,
    page.plan_display_label,
    page.max_active_users,
    page.valid_from,
    page.valid_until,
    page.revision,
    page.current_terms_version,
    page.created_at,
    page.updated_at,
    evaluation_time,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_created_at end,
    case when metadata.page_has_more then metadata.cursor_id end
  from numbered_licenses as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.created_at desc, page.id desc;
end;
$function$;

create function public.get_license(p_license_id uuid)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_legal_name text,
  status text,
  validity text,
  revision bigint,
  current_terms_version bigint,
  plan_key text,
  plan_version integer,
  plan_display_label text,
  max_active_users integer,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
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
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_license_id is null then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.licenses as license where license.id = p_license_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  evaluation_time := statement_timestamp();
  return query
  select
    license.id,
    license.tenant_id,
    tenant.legal_name,
    license.status,
    case
      when evaluation_time < terms.valid_from then 'not_started'
      when terms.valid_until is not null and evaluation_time >= terms.valid_until then 'expired'
      else 'valid'
    end,
    license.revision,
    license.current_terms_version,
    terms.plan_key,
    terms.plan_version,
    terms.plan_display_label,
    terms.max_active_users,
    terms.valid_from,
    terms.valid_until,
    license.created_at,
    license.updated_at,
    evaluation_time
  from public.licenses as license
  inner join public.tenants as tenant
    on tenant.id = license.tenant_id
  inner join public.license_terms_versions as terms
    on terms.license_id = license.id
    and terms.version = license.current_terms_version
  where license.id = p_license_id;
end;
$function$;

create function public.list_license_terms_versions(
  p_license_id uuid,
  p_page_size integer default 25,
  p_cursor_version bigint default null
)
returns table (
  license_id uuid,
  version bigint,
  introduced_at_revision bigint,
  introduced_at timestamptz,
  plan_key text,
  plan_version integer,
  plan_display_label text,
  max_active_users integer,
  valid_from timestamptz,
  valid_until timestamptz,
  has_more boolean,
  next_cursor_version bigint
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_license_id is null
    or p_page_size is null
    or p_page_size not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.licenses as license where license.id = p_license_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_cursor_version is not null and not exists (
    select 1
    from public.license_terms_versions as cursor_terms
    where cursor_terms.license_id = p_license_id
      and cursor_terms.version = p_cursor_version
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_terms as materialized (
    select
      terms.license_id,
      terms.version,
      terms.introduced_at_revision,
      audit.occurred_at as introduced_at,
      terms.plan_key,
      terms.plan_version,
      terms.plan_display_label,
      terms.max_active_users,
      terms.valid_from,
      terms.valid_until
    from public.license_terms_versions as terms
    inner join public.license_audit_events as audit
      on audit.license_id = terms.license_id
      and audit.revision_after = terms.introduced_at_revision
    where terms.license_id = p_license_id
      and (p_cursor_version is null or terms.version < p_cursor_version)
    order by terms.version desc
    limit p_page_size + 1
  ),
  numbered_terms as (
    select
      candidate.*,
      row_number() over (order by candidate.version desc) as page_position
    from candidate_terms as candidate
  ),
  page_metadata as (
    select
      count(*) > p_page_size as page_has_more,
      max(numbered.version)
        filter (where numbered.page_position = p_page_size) as cursor_version
    from numbered_terms as numbered
  )
  select
    page.license_id,
    page.version,
    page.introduced_at_revision,
    page.introduced_at,
    page.plan_key,
    page.plan_version,
    page.plan_display_label,
    page.max_active_users,
    page.valid_from,
    page.valid_until,
    metadata.page_has_more,
    case when metadata.page_has_more then metadata.cursor_version end
  from numbered_terms as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.version desc;
end;
$function$;

create function public.list_license_audit_events(
  p_license_id uuid,
  p_page_size integer default 25,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  license_id uuid,
  event_type text,
  actor_user_id uuid,
  occurred_at timestamptz,
  revision_before bigint,
  revision_after bigint,
  changed_fields text[],
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
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_license_id is null
    or p_page_size is null
    or p_page_size not between 1 and 100
    or (p_cursor_occurred_at is null) <> (p_cursor_id is null)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  if not exists (select 1 from public.licenses as license where license.id = p_license_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if p_cursor_id is not null and not exists (
    select 1
    from public.license_audit_events as cursor_event
    where cursor_event.license_id = p_license_id
      and cursor_event.occurred_at = p_cursor_occurred_at
      and cursor_event.id = p_cursor_id
  ) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_events as materialized (
    select
      audit.id,
      audit.license_id,
      audit.event_type,
      audit.actor_user_id,
      audit.occurred_at,
      audit.revision_before,
      audit.revision_after,
      audit.changed_fields,
      audit.correlation_id
    from public.license_audit_events as audit
    where audit.license_id = p_license_id
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
    page.license_id,
    page.event_type,
    page.actor_user_id,
    page.occurred_at,
    page.revision_before,
    page.revision_after,
    page.changed_fields,
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

alter function public.list_licenses(integer,timestamptz,timestamptz,uuid,uuid,text,text,boolean,text) owner to postgres;
alter function public.get_license(uuid) owner to postgres;
alter function public.list_license_terms_versions(uuid,integer,bigint) owner to postgres;
alter function public.list_license_audit_events(uuid,integer,timestamptz,uuid) owner to postgres;

comment on function public.list_licenses(integer,timestamptz,timestamptz,uuid,uuid,text,text,boolean,text) is
  'F2D6: owner+AAL2 license list with derived validity at one server-issued evaluation time, typed filters, literal legal-name search and created_at/id DESC keyset pagination.';
comment on function public.get_license(uuid) is
  'F2D6: owner+AAL2 license detail with current terms and validity derived at DB time. Historical terminated licenses are readable.';
comment on function public.list_license_terms_versions(uuid,integer,bigint) is
  'F2D6: owner+AAL2 license-bound terms history, version DESC keyset, with the introducing decision time from audit.';
comment on function public.list_license_audit_events(uuid,integer,timestamptz,uuid) is
  'F2D6: owner+AAL2 license-bound metadata audit, occurred_at/id DESC keyset. The audit table itself stays closed.';

revoke all privileges on function public.list_licenses(integer,timestamptz,timestamptz,uuid,uuid,text,text,boolean,text) from public, anon, authenticated, service_role;
revoke all privileges on function public.get_license(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.list_license_terms_versions(uuid,integer,bigint) from public, anon, authenticated, service_role;
revoke all privileges on function public.list_license_audit_events(uuid,integer,timestamptz,uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_licenses(integer,timestamptz,timestamptz,uuid,uuid,text,text,boolean,text) to authenticated;
grant execute on function public.get_license(uuid) to authenticated;
grant execute on function public.list_license_terms_versions(uuid,integer,bigint) to authenticated;
grant execute on function public.list_license_audit_events(uuid,integer,timestamptz,uuid) to authenticated;

commit;
