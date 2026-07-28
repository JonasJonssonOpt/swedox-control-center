create function public.list_installations(
  p_page_size integer default 50,
  p_cursor_display_name text default null,
  p_cursor_id uuid default null,
  p_tenant_id uuid default null,
  p_environment text default null,
  p_administrative_status text default null,
  p_include_archived boolean default false,
  p_search text default null
)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_legal_name text,
  installation_code text,
  display_name text,
  environment text,
  administrative_status text,
  hosting_region text,
  application_host text,
  revision bigint,
  updated_at timestamp with time zone,
  archived_at timestamp with time zone,
  has_more boolean,
  next_cursor_display_name text,
  next_cursor_id uuid
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  effective_page_size integer := coalesce(p_page_size, 50);
  effective_include_archived boolean := coalesce(p_include_archived, false);
  normalized_search text := nullif(btrim(p_search), '');
begin
  if auth.uid() is null
    or not coalesce(public.is_control_center_owner(), false)
  then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if effective_page_size < 1
    or effective_page_size > 100
    or (p_cursor_display_name is null) <> (p_cursor_id is null)
    or (
      p_cursor_display_name is not null
      and (
        p_cursor_display_name <> btrim(p_cursor_display_name)
        or char_length(p_cursor_display_name) not between 1 and 120
        or p_cursor_display_name ~ '[[:space:]]{2,}'
      )
    )
    or (
      p_environment is not null
      and p_environment not in ('production', 'staging', 'test', 'development')
    )
    or (
      p_administrative_status is not null
      and p_administrative_status not in (
        'planned', 'active', 'paused', 'decommissioned'
      )
    )
    or (
      normalized_search is not null
      and char_length(normalized_search) > 120
    )
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  if p_cursor_id is not null
    and not exists (
      select 1
      from public.installations as cursor_installation
      where cursor_installation.id = p_cursor_id
        and cursor_installation.display_name = p_cursor_display_name
        and (p_tenant_id is null or cursor_installation.tenant_id = p_tenant_id)
        and (
          p_environment is null
          or cursor_installation.environment = p_environment
        )
        and (
          p_administrative_status is null
          or cursor_installation.administrative_status =
            p_administrative_status
        )
        and (
          effective_include_archived
          or cursor_installation.archived_at is null
        )
        and (
          normalized_search is null
          or position(
            lower(normalized_search)
            in lower(cursor_installation.display_name)
          ) > 0
          or position(
            lower(normalized_search)
            in lower(cursor_installation.installation_code)
          ) > 0
        )
    )
  then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  return query
  with filtered_installations as materialized (
    select
      installation.id,
      installation.tenant_id,
      tenant.legal_name as tenant_legal_name,
      installation.installation_code,
      installation.display_name,
      installation.environment,
      installation.administrative_status,
      installation.hosting_region,
      case
        when installation.application_url is null then null
        else lower(
          split_part(
            split_part(
              split_part(substring(installation.application_url from 9), '/', 1),
              '?',
              1
            ),
            ':',
            1
          )
        )
      end as application_host,
      installation.revision,
      installation.updated_at,
      installation.archived_at
    from public.installations as installation
    inner join public.tenants as tenant
      on tenant.id = installation.tenant_id
    where (p_tenant_id is null or installation.tenant_id = p_tenant_id)
      and (
        p_environment is null
        or installation.environment = p_environment
      )
      and (
        p_administrative_status is null
        or installation.administrative_status = p_administrative_status
      )
      and (
        effective_include_archived
        or installation.archived_at is null
      )
      and (
        normalized_search is null
        or position(
          lower(normalized_search)
          in lower(installation.display_name)
        ) > 0
        or position(
          lower(normalized_search)
          in lower(installation.installation_code)
        ) > 0
      )
      and (
        p_cursor_id is null
        or (installation.display_name, installation.id) >
          (p_cursor_display_name, p_cursor_id)
      )
    order by installation.display_name asc, installation.id asc
    limit effective_page_size + 1
  ),
  numbered_installations as (
    select
      candidate.*,
      row_number() over (
        order by candidate.display_name asc, candidate.id asc
      ) as page_position
    from filtered_installations as candidate
  ),
  page_metadata as (
    select
      count(*) > effective_page_size as page_has_more,
      max(numbered.display_name)
        filter (
          where numbered.page_position = effective_page_size
        ) as cursor_display_name,
      (
        array_agg(numbered.id)
          filter (
            where numbered.page_position = effective_page_size
          )
      )[1] as cursor_id
    from numbered_installations as numbered
  )
  select
    page.id,
    page.tenant_id,
    page.tenant_legal_name,
    page.installation_code,
    page.display_name,
    page.environment,
    page.administrative_status,
    page.hosting_region,
    page.application_host,
    page.revision,
    page.updated_at,
    page.archived_at,
    metadata.page_has_more,
    case
      when metadata.page_has_more then metadata.cursor_display_name
      else null
    end,
    case
      when metadata.page_has_more then metadata.cursor_id
      else null
    end
  from numbered_installations as page
  cross join page_metadata as metadata
  where page.page_position <= effective_page_size
  order by page.display_name asc, page.id asc;
end;
$function$;

comment on function public.list_installations(integer, text, uuid, uuid, text, text, boolean, text) is
  'Lists owner-visible installations with safe metadata, typed filters, literal search, and stable display-name/UUID cursor pagination.';

revoke execute on function public.list_installations(integer, text, uuid, uuid, text, text, boolean, text) from public;
revoke execute on function public.list_installations(integer, text, uuid, uuid, text, text, boolean, text) from anon;
revoke execute on function public.list_installations(integer, text, uuid, uuid, text, text, boolean, text) from service_role;
grant execute on function public.list_installations(integer, text, uuid, uuid, text, text, boolean, text) to authenticated;
