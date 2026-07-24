create function public.is_valid_swedish_organization_number(value text)
returns boolean
language plpgsql
immutable
strict
parallel safe
security invoker
set search_path = pg_catalog
as $function$
declare
  digit integer;
  total integer := 0;
begin
  if value !~ '^[0-9]{10}$' then
    return false;
  end if;

  for position in 1..10 loop
    digit := substring(value from position for 1)::integer;

    if position % 2 = 1 then
      digit := digit * 2;

      if digit > 9 then
        digit := digit - 9;
      end if;
    end if;

    total := total + digit;
  end loop;

  return total % 10 = 0;
end;
$function$;

comment on function public.is_valid_swedish_organization_number(text) is
  'Validates the canonical ten-digit Swedish organization-number format and Luhn checksum.';

revoke execute on function public.is_valid_swedish_organization_number(text) from public;
revoke execute on function public.is_valid_swedish_organization_number(text) from anon;
revoke execute on function public.is_valid_swedish_organization_number(text) from authenticated;
revoke execute on function public.is_valid_swedish_organization_number(text) from service_role;

create table public.tenants (
  id uuid not null default gen_random_uuid(),
  category text not null,
  organization_number text,
  legal_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  country_code text not null default 'SE',
  operational_status text not null default 'active',
  archived_at timestamp with time zone,
  archived_by uuid,
  revision bigint not null default 1,
  created_at timestamp with time zone not null default current_timestamp,
  created_by uuid not null,
  updated_at timestamp with time zone not null default current_timestamp,
  updated_by uuid not null,
  administrative_note text,
  constraint pk_tenants primary key (id),
  constraint ck_tenants_category
    check (category in ('customer', 'pilot', 'internal')),
  constraint ck_tenants_organization_number_required
    check (
      (category in ('customer', 'pilot') and organization_number is not null)
      or category = 'internal'
    ),
  constraint ck_tenants_organization_number_format
    check (
      organization_number is null
      or organization_number ~ '^[0-9]{10}$'
    ),
  constraint ck_tenants_organization_number_valid
    check (
      organization_number is null
      or public.is_valid_swedish_organization_number(organization_number)
    ),
  constraint ck_tenants_legal_name
    check (
      legal_name = btrim(legal_name)
      and char_length(legal_name) between 1 and 200
    ),
  constraint ck_tenants_contact_name
    check (
      contact_name is null
      or (
        contact_name = btrim(contact_name)
        and char_length(contact_name) between 1 and 120
      )
    ),
  constraint ck_tenants_contact_email
    check (
      contact_email is null
      or (
        contact_email = lower(btrim(contact_email))
        and char_length(contact_email) between 3 and 254
        and contact_email !~ '[[:space:]]'
        and position('@' in contact_email) > 1
        and position('@' in contact_email) < char_length(contact_email)
      )
    ),
  constraint ck_tenants_contact_phone
    check (
      contact_phone is null
      or (
        contact_phone = btrim(contact_phone)
        and char_length(contact_phone) between 1 and 32
      )
    ),
  constraint ck_tenants_country_code check (country_code = 'SE'),
  constraint ck_tenants_operational_status
    check (operational_status in ('active', 'paused')),
  constraint ck_tenants_archive_metadata
    check (
      (archived_at is null and archived_by is null)
      or (archived_at is not null and archived_by is not null)
    ),
  constraint ck_tenants_revision check (revision > 0),
  constraint ck_tenants_timestamps check (updated_at >= created_at),
  constraint ck_tenants_administrative_note
    check (
      administrative_note is null
      or (
        administrative_note = btrim(administrative_note)
        and char_length(administrative_note) between 1 and 1000
      )
    )
);

create unique index idx_tenants_organization_number_unique
  on public.tenants (organization_number)
  where organization_number is not null;

create index idx_tenants_active_legal_name
  on public.tenants (legal_name, id)
  where archived_at is null;

comment on table public.tenants is
  'Stores the legal customer organization independently of installations, licenses, provisioning, and support.';
comment on column public.tenants.id is
  'The tenant UUID and only permanent tenant identity.';
comment on column public.tenants.category is
  'The immutable tenant classification: customer, pilot, or internal.';
comment on column public.tenants.organization_number is
  'Canonical ten-digit Swedish organization number without presentation formatting.';
comment on column public.tenants.operational_status is
  'Operational state independent of archival state: active or paused.';
comment on column public.tenants.revision is
  'Positive optimistic-concurrency revision controlled by future database mutations.';
comment on column public.tenants.administrative_note is
  'Short sensitive administrative text that must not enter technical logs or audit payloads.';

revoke all privileges on table public.tenants from public;
revoke all privileges on table public.tenants from anon;
revoke all privileges on table public.tenants from authenticated;
revoke all privileges on table public.tenants from service_role;
