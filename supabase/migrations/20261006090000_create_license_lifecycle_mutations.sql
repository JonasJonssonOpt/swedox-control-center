begin;

-- F2D5B: shared lock order for every Licensing mutation is Tenant -> License.
-- tenant_id is immutable, so the unlocked lookup only selects which Tenant to lock.

create function public.activate_license(
  p_license_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.licenses
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  license_tenant_id uuid;
  current_tenant public.tenants;
  current_license public.licenses;
  current_valid_until timestamptz;
  decision_time timestamptz;
  updated_license public.licenses;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_license_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select tenant_id into license_tenant_id from public.licenses where id = p_license_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into current_tenant from public.tenants
  where id = license_tenant_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into current_license from public.licenses
  where id = p_license_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  -- clock_timestamp, not transaction-start time: capture once after lock waits.
  decision_time := clock_timestamp();

  if current_license.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_license.status not in ('draft', 'suspended') then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;
  if current_tenant.operational_status <> 'active' or current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  select valid_until into current_valid_until from public.license_terms_versions
  where license_id = current_license.id and version = current_license.current_terms_version;
  if not found then
    raise exception using errcode = '23514', message = 'license history integrity violation';
  end if;
  -- An ended interval must be renewed first; a future start is allowed (not_started).
  if current_valid_until is not null and decision_time >= current_valid_until then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.licenses
  set status = 'active', revision = current_license.revision + 1,
      updated_at = decision_time, updated_by = actor_id
  where id = current_license.id
  returning * into updated_license;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(updated_license.id,'license_activated',actor_id,decision_time,current_license.revision,updated_license.revision,
      array['status','revision','updated_at','updated_by']::text[],p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_license;
end;
$function$;

create function public.suspend_license(
  p_license_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.licenses
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  license_tenant_id uuid;
  current_license public.licenses;
  decision_time timestamptz;
  updated_license public.licenses;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_license_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select tenant_id into license_tenant_id from public.licenses where id = p_license_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Lock order only; a paused or archived Tenant never blocks a withdrawal.
  perform 1 from public.tenants where id = license_tenant_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into current_license from public.licenses
  where id = p_license_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  decision_time := clock_timestamp();

  if current_license.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_license.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.licenses
  set status = 'suspended', revision = current_license.revision + 1,
      updated_at = decision_time, updated_by = actor_id
  where id = current_license.id
  returning * into updated_license;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(updated_license.id,'license_suspended',actor_id,decision_time,current_license.revision,updated_license.revision,
      array['status','revision','updated_at','updated_by']::text[],p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_license;
end;
$function$;

create function public.terminate_license(
  p_license_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.licenses
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid;
  license_tenant_id uuid;
  current_license public.licenses;
  decision_time timestamptz;
  updated_license public.licenses;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_license_id is null or p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select tenant_id into license_tenant_id from public.licenses where id = p_license_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Lock order only; a paused or archived Tenant never blocks a withdrawal.
  perform 1 from public.tenants where id = license_tenant_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into current_license from public.licenses
  where id = p_license_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  decision_time := clock_timestamp();

  if current_license.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_license.status not in ('draft', 'active', 'suspended') then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.licenses
  set status = 'terminated', revision = current_license.revision + 1,
      updated_at = decision_time, updated_by = actor_id
  where id = current_license.id
  returning * into updated_license;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(updated_license.id,'license_terminated',actor_id,decision_time,current_license.revision,updated_license.revision,
      array['status','revision','updated_at','updated_by']::text[],p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_license;
end;
$function$;

alter function public.activate_license(uuid,bigint,uuid) owner to postgres;
alter function public.suspend_license(uuid,bigint,uuid) owner to postgres;
alter function public.terminate_license(uuid,bigint,uuid) owner to postgres;

comment on function public.activate_license(uuid,bigint,uuid) is
  'F2D5B: owner+AAL2 activates or reactivates a draft/suspended, not yet ended license for an available Tenant. Tenant -> License locks, expected revision, unchanged terms, atomic license_activated audit.';
comment on function public.suspend_license(uuid,bigint,uuid) is
  'F2D5B: owner+AAL2 suspends an active license regardless of Tenant availability. Tenant -> License locks, expected revision, unchanged terms, atomic license_suspended audit.';
comment on function public.terminate_license(uuid,bigint,uuid) is
  'F2D5B: owner+AAL2 terminally ends a draft/active/suspended license regardless of Tenant availability. Tenant -> License locks, expected revision, unchanged terms, atomic license_terminated audit.';

revoke all privileges on function public.activate_license(uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all privileges on function public.suspend_license(uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all privileges on function public.terminate_license(uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function public.activate_license(uuid,bigint,uuid) to authenticated;
grant execute on function public.suspend_license(uuid,bigint,uuid) to authenticated;
grant execute on function public.terminate_license(uuid,bigint,uuid) to authenticated;

commit;
