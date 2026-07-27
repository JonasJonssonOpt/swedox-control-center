create function public.list_tenant_audit_events(
  p_tenant_id uuid,
  p_page_size integer default 50,
  p_cursor_occurred_at timestamp with time zone default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  tenant_id uuid,
  event_type text,
  actor_user_id uuid,
  occurred_at timestamp with time zone,
  revision_before bigint,
  revision_after bigint,
  changed_fields text[],
  correlation_id uuid,
  has_more boolean,
  next_cursor_occurred_at timestamp with time zone,
  next_cursor_id uuid
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null
    or not coalesce(public.is_control_center_owner(), false)
  then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_tenant_id is null
    or p_page_size is null
    or p_page_size < 1
    or p_page_size > 100
    or (p_cursor_occurred_at is null) <> (p_cursor_id is null)
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  if not exists (
    select 1
    from public.tenants as tenant
    where tenant.id = p_tenant_id
  ) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if p_cursor_id is not null
    and not exists (
      select 1
      from public.tenant_audit_events as cursor_event
      where cursor_event.tenant_id = p_tenant_id
        and cursor_event.occurred_at = p_cursor_occurred_at
        and cursor_event.id = p_cursor_id
    )
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with candidate_events as materialized (
    select audit.*
    from public.tenant_audit_events as audit
    where audit.tenant_id = p_tenant_id
      and (
        p_cursor_id is null
        or (audit.occurred_at, audit.id) <
          (p_cursor_occurred_at, p_cursor_id)
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
    page.tenant_id,
    page.event_type,
    page.actor_user_id,
    page.occurred_at,
    page.revision_before,
    page.revision_after,
    page.changed_fields,
    page.correlation_id,
    metadata.page_has_more,
    case
      when metadata.page_has_more then metadata.cursor_occurred_at
      else null
    end,
    case
      when metadata.page_has_more then metadata.cursor_id
      else null
    end
  from numbered_events as page
  cross join page_metadata as metadata
  where page.page_position <= p_page_size
  order by page.occurred_at desc, page.id desc;
end;
$function$;

comment on function public.list_tenant_audit_events(uuid, integer, timestamp with time zone, uuid) is
  'Lists one tenant audit history newest-first with a typed, tenant-bound cursor and no direct audit table grant.';

revoke execute on function public.list_tenant_audit_events(uuid, integer, timestamp with time zone, uuid) from public;
revoke execute on function public.list_tenant_audit_events(uuid, integer, timestamp with time zone, uuid) from anon;
revoke execute on function public.list_tenant_audit_events(uuid, integer, timestamp with time zone, uuid) from service_role;
grant execute on function public.list_tenant_audit_events(uuid, integer, timestamp with time zone, uuid) to authenticated;
