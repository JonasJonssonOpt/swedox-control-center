create or replace function public.activate_installation(
  p_installation_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.installations
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_installation public.installations;
  updated_installation public.installations;
  tenant_available boolean;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_installation from public.installations
  where id = p_installation_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'not_found'; end if;
  if current_installation.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_installation.archived_at is not null
    or current_installation.administrative_status not in ('planned', 'paused')
  then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  select operational_status = 'active' and archived_at is null
  into tenant_available from public.tenants
  where id = current_installation.tenant_id for key share;
  if not found or not tenant_available then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  update public.installations
  set administrative_status = 'active',
      revision = current_installation.revision + 1,
      updated_at = current_timestamp,
      updated_by = actor_id
  where id = current_installation.id
  returning * into updated_installation;

  begin
    insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields, correlation_id
    ) values (
      updated_installation.id, 'installation_activated', actor_id,
      current_installation.revision, updated_installation.revision,
      array['administrative_status', 'revision', 'updated_at', 'updated_by'],
      p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;
  return updated_installation;
end;
$function$;

alter function public.activate_installation(uuid, bigint, uuid)
  owner to postgres;

comment on function public.activate_installation(uuid, bigint, uuid) is
  'Administratively activates a planned or paused installation independently of provisioning metadata, with tenant availability, optimistic concurrency, and atomic audit.';

revoke execute on function public.activate_installation(uuid, bigint, uuid) from public;
revoke execute on function public.activate_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.activate_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.activate_installation(uuid, bigint, uuid) to authenticated;
