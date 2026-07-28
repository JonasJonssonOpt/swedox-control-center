create table public.installations (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  installation_code text not null,
  display_name text not null,
  environment text not null,
  administrative_status text not null default 'planned',
  application_url text,
  supabase_project_ref text,
  hosting_region text,
  administrative_note text,
  revision bigint not null default 1,
  created_at timestamp with time zone not null default current_timestamp,
  created_by uuid not null,
  updated_at timestamp with time zone not null default current_timestamp,
  updated_by uuid not null,
  archived_at timestamp with time zone,
  archived_by uuid,
  constraint pk_installations primary key (id),
  constraint fk_installations_tenant
    foreign key (tenant_id)
    references public.tenants (id)
    on delete restrict,
  constraint ck_installations_installation_code
    check (
      installation_code = btrim(installation_code)
      and char_length(installation_code) between 1 and 64
      and installation_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint ck_installations_display_name
    check (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 120
      and display_name !~ '[[:space:]]{2,}'
    ),
  constraint ck_installations_environment
    check (
      environment in ('production', 'staging', 'test', 'development')
    ),
  constraint ck_installations_administrative_status
    check (
      administrative_status in (
        'planned',
        'active',
        'paused',
        'decommissioned'
      )
    ),
  constraint ck_installations_application_url
    check (
      application_url is null
      or (
        application_url = btrim(application_url)
        and char_length(application_url) between 9 and 2048
        and application_url !~ '[[:space:]]'
        and application_url !~ '#'
        and application_url ~
          '^https://[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]{1,5})?(?:[/?][^#[:space:]]*)?$'
        and split_part(
          split_part(substring(application_url from 9), '/', 1),
          '?',
          1
        ) !~ '@'
      )
    ),
  constraint ck_installations_supabase_project_ref
    check (
      supabase_project_ref is null
      or (
        supabase_project_ref = btrim(supabase_project_ref)
        and char_length(supabase_project_ref) between 1 and 64
        and supabase_project_ref ~ '^[a-z0-9]+$'
      )
    ),
  constraint ck_installations_hosting_region
    check (
      hosting_region is null
      or (
        hosting_region = btrim(hosting_region)
        and char_length(hosting_region) between 1 and 64
        and hosting_region ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      )
    ),
  constraint ck_installations_administrative_note
    check (
      administrative_note is null
      or (
        administrative_note = btrim(administrative_note)
        and char_length(administrative_note) between 1 and 1000
      )
    ),
  constraint ck_installations_revision check (revision > 0),
  constraint ck_installations_timestamps check (updated_at >= created_at),
  constraint ck_installations_archive_metadata
    check (
      (archived_at is null and archived_by is null)
      or (archived_at is not null and archived_by is not null)
    )
);

create unique index idx_installations_installation_code_unique
  on public.installations (installation_code);

create unique index idx_installations_supabase_project_ref_unique
  on public.installations (supabase_project_ref)
  where supabase_project_ref is not null;

create index idx_installations_tenant_id
  on public.installations (tenant_id);

create index idx_installations_active_display_name
  on public.installations (display_name, id)
  where archived_at is null;

create index idx_installations_tenant_active_display_name
  on public.installations (tenant_id, display_name, id)
  where archived_at is null;

comment on table public.installations is
  'Stores centrally managed technical SweDox installation metadata; customer data and credentials are prohibited.';
comment on column public.installations.tenant_id is
  'The immutable owning tenant; availability rules are enforced by future mutation functions.';
comment on column public.installations.installation_code is
  'Globally unique immutable lowercase installation identifier.';
comment on column public.installations.environment is
  'Immutable technical environment: production, staging, test, or development.';
comment on column public.installations.administrative_status is
  'Administrative lifecycle state, separate from provisioning, deployment, and health.';
comment on column public.installations.application_url is
  'Canonical HTTPS metadata only; it must not be fetched without a separately reviewed outbound-request policy.';
comment on column public.installations.supabase_project_ref is
  'Protected technical project identifier, never a credential and never general log metadata.';
comment on column public.installations.administrative_note is
  'Confidential administrative metadata that must not enter technical logs or audit payloads.';
comment on column public.installations.revision is
  'Positive optimistic-concurrency revision controlled by future database mutations.';

revoke all privileges on table public.installations from public;
revoke all privileges on table public.installations from anon;
revoke all privileges on table public.installations from authenticated;
revoke all privileges on table public.installations from service_role;
