create table public.installation_audit_events (
  id uuid not null default gen_random_uuid(),
  installation_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  occurred_at timestamp with time zone not null default current_timestamp,
  revision_before bigint,
  revision_after bigint not null,
  changed_fields text[] not null,
  correlation_id uuid,
  constraint pk_installation_audit_events primary key (id),
  constraint fk_installation_audit_events_installation_id
    foreign key (installation_id)
    references public.installations (id)
    on delete restrict,
  constraint uq_installation_audit_events_installation_revision
    unique (installation_id, revision_after),
  constraint ck_installation_audit_events_event_type
    check (
      event_type in (
        'installation_created',
        'installation_edited',
        'installation_activated',
        'installation_paused',
        'installation_decommissioned',
        'installation_archived',
        'installation_restored'
      )
    ),
  constraint ck_installation_audit_events_revisions
    check (
      (
        event_type = 'installation_created'
        and revision_before is null
        and revision_after = 1
      )
      or (
        event_type <> 'installation_created'
        and revision_before > 0
        and revision_after = revision_before + 1
      )
    ),
  constraint ck_installation_audit_events_changed_fields
    check (
      array_ndims(changed_fields) = 1
      and cardinality(changed_fields) > 0
      and array_position(changed_fields, null) is null
      and (array_to_string(changed_fields, ',') || ',') ~
        '^(id,)?(tenant_id,)?(installation_code,)?(display_name,)?(environment,)?(administrative_status,)?(application_url,)?(supabase_project_ref,)?(hosting_region,)?(administrative_note,)?(revision,)?(created_at,)?(created_by,)?(updated_at,)?(updated_by,)?(archived_at,)?(archived_by,)?$'
    )
);

create index idx_installation_audit_events_installation_occurred
  on public.installation_audit_events (
    installation_id,
    occurred_at desc,
    id desc
  );

comment on table public.installation_audit_events is
  'Append-only installation mutation metadata. Values, snapshots, secrets, endpoints, project refs, and request payloads are prohibited.';
comment on column public.installation_audit_events.installation_id is
  'Installation relation from which tenant ownership is derived without duplicating tenant identity.';
comment on column public.installation_audit_events.actor_user_id is
  'Auth actor UUID bound by a future mutation function; intentionally has no Auth FK so history survives user deletion.';
comment on column public.installation_audit_events.revision_before is
  'Previous installation revision; null only for installation_created.';
comment on column public.installation_audit_events.revision_after is
  'Positive installation revision after the mutation and unique per installation.';
comment on column public.installation_audit_events.changed_fields is
  'Non-empty, installation-column-order allowlist of field names; contains no field values.';
comment on column public.installation_audit_events.correlation_id is
  'Optional server-generated request correlation UUID; must not contain identity or business data.';

create function public.prevent_installation_audit_event_modification()
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
    message = 'installation audit events are append-only';
end;
$function$;

comment on function public.prevent_installation_audit_event_modification() is
  'Rejects every UPDATE or DELETE of an existing installation audit event.';

revoke execute on function public.prevent_installation_audit_event_modification() from public;
revoke execute on function public.prevent_installation_audit_event_modification() from anon;
revoke execute on function public.prevent_installation_audit_event_modification() from authenticated;
revoke execute on function public.prevent_installation_audit_event_modification() from service_role;

create trigger trg_installation_audit_events_append_only
before update or delete on public.installation_audit_events
for each row
execute function public.prevent_installation_audit_event_modification();

alter table public.installation_audit_events enable row level security;
alter table public.installation_audit_events force row level security;

revoke all privileges on table public.installation_audit_events from public;
revoke all privileges on table public.installation_audit_events from anon;
revoke all privileges on table public.installation_audit_events from authenticated;
revoke all privileges on table public.installation_audit_events from service_role;
