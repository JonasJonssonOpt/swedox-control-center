create table public.tenant_audit_events (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  occurred_at timestamp with time zone not null default current_timestamp,
  revision_before bigint,
  revision_after bigint not null,
  changed_fields text[] not null,
  correlation_id uuid,
  constraint pk_tenant_audit_events primary key (id),
  constraint fk_tenant_audit_events_tenant_id
    foreign key (tenant_id)
    references public.tenants (id)
    on delete restrict,
  constraint uq_tenant_audit_events_tenant_revision
    unique (tenant_id, revision_after),
  constraint ck_tenant_audit_events_event_type
    check (
      event_type in (
        'tenant_created',
        'tenant_edited',
        'tenant_paused',
        'tenant_activated',
        'tenant_archived',
        'tenant_restored'
      )
    ),
  constraint ck_tenant_audit_events_revisions
    check (
      (
        event_type = 'tenant_created'
        and revision_before is null
        and revision_after = 1
      )
      or (
        event_type <> 'tenant_created'
        and revision_before > 0
        and revision_after = revision_before + 1
      )
    ),
  constraint ck_tenant_audit_events_changed_fields
    check (
      array_ndims(changed_fields) = 1
      and cardinality(changed_fields) > 0
      and array_position(changed_fields, null) is null
      and (array_to_string(changed_fields, ',') || ',') ~
        '^(administrative_note,)?(archived_at,)?(archived_by,)?(category,)?(contact_email,)?(contact_name,)?(contact_phone,)?(country_code,)?(created_at,)?(created_by,)?(id,)?(legal_name,)?(operational_status,)?(organization_number,)?(revision,)?(updated_at,)?(updated_by,)?$'
    )
);

create index idx_tenant_audit_events_tenant_occurred
  on public.tenant_audit_events (tenant_id, occurred_at desc, id desc);

comment on table public.tenant_audit_events is
  'Append-only tenant mutation metadata. Values, snapshots, secrets, and request payloads are prohibited.';
comment on column public.tenant_audit_events.actor_user_id is
  'Auth actor UUID bound by a future mutation function; intentionally has no Auth FK so history survives user deletion.';
comment on column public.tenant_audit_events.revision_before is
  'Previous tenant revision; null only for tenant_created.';
comment on column public.tenant_audit_events.revision_after is
  'Positive tenant revision after the mutation and unique per tenant.';
comment on column public.tenant_audit_events.changed_fields is
  'Non-empty, canonical-order allowlist of tenant column names; contains no field values.';
comment on column public.tenant_audit_events.correlation_id is
  'Optional synthetic request correlation UUID; must not contain identity or business data.';

create function public.prevent_tenant_audit_event_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'tenant audit events are append-only';
end;
$function$;

comment on function public.prevent_tenant_audit_event_modification() is
  'Rejects every UPDATE or DELETE of an existing tenant audit event.';

revoke execute on function public.prevent_tenant_audit_event_modification() from public;
revoke execute on function public.prevent_tenant_audit_event_modification() from anon;
revoke execute on function public.prevent_tenant_audit_event_modification() from authenticated;
revoke execute on function public.prevent_tenant_audit_event_modification() from service_role;

create trigger trg_tenant_audit_events_append_only
before update or delete on public.tenant_audit_events
for each row
execute function public.prevent_tenant_audit_event_modification();

alter table public.tenant_audit_events enable row level security;
alter table public.tenant_audit_events force row level security;

revoke all privileges on table public.tenant_audit_events from public;
revoke all privileges on table public.tenant_audit_events from anon;
revoke all privileges on table public.tenant_audit_events from authenticated;
revoke all privileges on table public.tenant_audit_events from service_role;
