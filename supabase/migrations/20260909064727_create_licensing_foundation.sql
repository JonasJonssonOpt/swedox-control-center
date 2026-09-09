create table public.licenses (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  status text not null default 'draft',
  revision bigint not null default 1,
  current_terms_version bigint not null default 1,
  created_at timestamptz not null default current_timestamp,
  created_by uuid not null,
  updated_at timestamptz not null default current_timestamp,
  updated_by uuid not null,
  constraint pk_licenses primary key (id),
  constraint fk_licenses_tenant_id foreign key (tenant_id)
    references public.tenants(id) on delete restrict,
  constraint ck_licenses_status check (status in ('draft', 'active', 'suspended', 'terminated')),
  constraint ck_licenses_revision check (revision > 0),
  constraint ck_licenses_current_terms_version
    check (current_terms_version > 0 and current_terms_version <= revision),
  constraint ck_licenses_timestamps
    check (isfinite(created_at) and isfinite(updated_at) and updated_at >= created_at)
);

create unique index idx_licenses_tenant_non_terminated_unique
  on public.licenses (tenant_id) where status <> 'terminated';
create index idx_licenses_tenant_id on public.licenses (tenant_id);
create index idx_licenses_created_at_id on public.licenses (created_at desc, id desc);

create table public.license_audit_events (
  id uuid not null default gen_random_uuid(),
  license_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  occurred_at timestamptz not null default current_timestamp,
  revision_before bigint,
  revision_after bigint not null,
  changed_fields text[] not null,
  correlation_id uuid,
  constraint pk_license_audit_events primary key (id),
  constraint fk_license_audit_events_license_id foreign key (license_id)
    references public.licenses(id) on delete restrict,
  constraint uq_license_audit_events_license_revision unique (license_id, revision_after),
  constraint ck_license_audit_events_event_type check (event_type in (
    'license_created', 'license_terms_changed', 'license_activated',
    'license_suspended', 'license_renewed', 'license_terminated'
  )),
  constraint ck_license_audit_events_revisions check (
    revision_after > 0 and (
      (event_type = 'license_created' and revision_before is null and revision_after = 1)
      or (event_type <> 'license_created' and revision_before is not null
        and revision_before > 0 and revision_before = revision_after - 1)
    )
  ),
  constraint ck_license_audit_events_occurred_at check (isfinite(occurred_at)),
  constraint ck_license_audit_events_changed_fields check (
    case when array_ndims(changed_fields) = 1 and cardinality(changed_fields) > 0
    then array_position(changed_fields, null) is null
      and changed_fields <@ array[
        'id', 'tenant_id', 'status', 'revision', 'current_terms_version',
        'plan_key', 'plan_version', 'plan_display_label', 'max_active_users',
        'valid_from', 'valid_until', 'created_at', 'created_by', 'updated_at', 'updated_by'
      ]::text[]
      and (array_to_string(changed_fields, ',') || ',') ~
        '^(id,)?(tenant_id,)?(status,)?(revision,)?(current_terms_version,)?(plan_key,)?(plan_version,)?(plan_display_label,)?(max_active_users,)?(valid_from,)?(valid_until,)?(created_at,)?(created_by,)?(updated_at,)?(updated_by,)?$'
    else false end
  )
);
create index idx_license_audit_events_license_occurred
  on public.license_audit_events (license_id, occurred_at desc, id desc);

create table public.license_terms_versions (
  license_id uuid not null,
  version bigint not null,
  introduced_at_revision bigint not null,
  plan_key text not null,
  plan_version integer not null,
  plan_display_label text not null,
  max_active_users integer not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  constraint pk_license_terms_versions primary key (license_id, version),
  constraint fk_license_terms_versions_license_id foreign key (license_id)
    references public.licenses(id) on delete restrict,
  constraint uq_license_terms_versions_license_revision unique (license_id, introduced_at_revision),
  constraint fk_license_terms_versions_audit_revision
    foreign key (license_id, introduced_at_revision)
    references public.license_audit_events(license_id, revision_after)
    on update no action on delete no action deferrable initially deferred,
  constraint ck_license_terms_versions_versions
    check (version > 0 and introduced_at_revision > 0 and introduced_at_revision >= version),
  constraint ck_license_terms_versions_plan_version check (plan_version > 0),
  constraint ck_license_terms_versions_max_active_users check (max_active_users > 0),
  constraint ck_license_terms_versions_plan_snapshot check (
    (plan_key = 'mini' and plan_version = 1 and plan_display_label = 'Mini' and max_active_users = 24)
    or (plan_key = 'standard' and plan_version = 1 and plan_display_label = 'Standard' and max_active_users = 49)
    or (plan_key = 'stor' and plan_version = 1 and plan_display_label = 'Stor' and max_active_users = 100)
  ),
  constraint ck_license_terms_versions_validity check (
    isfinite(valid_from)
    and (valid_until is null or (isfinite(valid_until) and valid_until > valid_from))
  )
);

alter table public.licenses add constraint fk_licenses_current_terms
  foreign key (id, current_terms_version)
  references public.license_terms_versions(license_id, version)
  on update no action on delete no action deferrable initially deferred;

comment on table public.licenses is
  'Tenant-owned license foundation. No product read or mutation access in F2D2.';
comment on column public.licenses.tenant_id is
  'Immutable tenant identity; availability is enforced by future Licensing mutations.';
comment on column public.licenses.revision is
  'Positive license mutation revision, distinct from terms version. Atomic audit enforcement follows in F2D4/F2D5.';
comment on column public.licenses.current_terms_version is
  'Required same-license terms reference checked at commit.';
comment on column public.licenses.created_by is
  'Actor UUID without Auth FK or default; bound by future authorized mutations.';
comment on column public.licenses.updated_by is
  'Actor UUID without Auth FK or default; bound by future authorized mutations.';
comment on table public.license_terms_versions is
  'Versioned technical snapshots, no prices, modules, usage or secrets. Append-only triggers follow in F2D4.';
comment on column public.license_terms_versions.introduced_at_revision is
  'Same-license audit reference supplies actor and decision time; FK alone does not prove full revision continuity.';
comment on column public.license_terms_versions.max_active_users is
  'Granted tenant-wide capacity for enabled SweDox login accounts, never multiplied per installation.';
comment on column public.license_terms_versions.valid_until is
  'Exclusive finite end; NULL explicitly means open-ended.';
comment on table public.license_audit_events is
  'Structural metadata-only license audit foundation. Full append-only and mutation integration follow later.';
comment on column public.license_audit_events.actor_user_id is
  'Required actor UUID without Auth FK; future mutation binds auth.uid().';
comment on column public.license_audit_events.changed_fields is
  'Canonical non-empty field-name subset only; never values or payloads.';

alter table public.licenses enable row level security;
alter table public.licenses force row level security;
alter table public.license_terms_versions enable row level security;
alter table public.license_terms_versions force row level security;
alter table public.license_audit_events enable row level security;
alter table public.license_audit_events force row level security;

revoke all privileges on table public.licenses, public.license_terms_versions, public.license_audit_events from public;
revoke all privileges on table public.licenses, public.license_terms_versions, public.license_audit_events from anon;
revoke all privileges on table public.licenses, public.license_terms_versions, public.license_audit_events from authenticated;
revoke all privileges on table public.licenses, public.license_terms_versions, public.license_audit_events from service_role;

