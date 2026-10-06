begin;

-- F2D5C: terms change and renewal. Same Tenant -> License lock order as all
-- Licensing writes. Both require an available Tenant and add exactly one terms version.

create function public.change_license_terms(
  p_license_id uuid,
  p_expected_revision bigint,
  p_plan_key text,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
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
  current_terms public.license_terms_versions;
  decision_time timestamptz;
  next_valid_from timestamptz;
  next_valid_until timestamptz;
  plan_label text;
  plan_capacity integer;
  audit_changed_fields text[];
  updated_license public.licenses;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_license_id is null or p_expected_revision is null or p_expected_revision <= 0
    or p_plan_key is null or p_plan_key not in ('mini', 'standard', 'stor')
    or (p_valid_from is not null and not isfinite(p_valid_from))
    or (p_valid_until is not null and not isfinite(p_valid_until)) then
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
  if current_license.status not in ('draft', 'active', 'suspended') then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;
  -- Every terms change, including a downgrade, requires an available Tenant.
  if current_tenant.operational_status <> 'active' or current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  select * into current_terms from public.license_terms_versions
  where license_id = current_license.id and version = current_license.current_terms_version;
  if not found then
    raise exception using errcode = '23514', message = 'license history integrity violation';
  end if;

  if current_license.status = 'draft' then
    -- A draft replaces its whole target image under the create date rules.
    next_valid_from := coalesce(p_valid_from, decision_time);
    next_valid_until := p_valid_until;
    if next_valid_from < decision_time
      or (next_valid_until is not null and next_valid_until <= next_valid_from) then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;
  else
    -- After activation a plan change preserves dates; date changes go through renewal.
    if p_valid_from is not null or p_valid_until is not null then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;
    next_valid_from := current_terms.valid_from;
    next_valid_until := current_terms.valid_until;
  end if;

  plan_label := case p_plan_key when 'mini' then 'Mini' when 'standard' then 'Standard' when 'stor' then 'Stor' end;
  plan_capacity := case p_plan_key when 'mini' then 24 when 'standard' then 49 when 'stor' then 100 end;

  if p_plan_key = current_terms.plan_key and current_terms.plan_version = 1
    and next_valid_from = current_terms.valid_from
    and next_valid_until is not distinct from current_terms.valid_until then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  audit_changed_fields := array_remove(array[
    'revision', 'current_terms_version',
    case when p_plan_key <> current_terms.plan_key then 'plan_key' end,
    case when current_terms.plan_version <> 1 then 'plan_version' end,
    case when plan_label <> current_terms.plan_display_label then 'plan_display_label' end,
    case when plan_capacity <> current_terms.max_active_users then 'max_active_users' end,
    case when next_valid_from <> current_terms.valid_from then 'valid_from' end,
    case when next_valid_until is distinct from current_terms.valid_until then 'valid_until' end,
    'updated_at', 'updated_by'
  ]::text[], null);

  update public.licenses
  set revision = current_license.revision + 1,
      current_terms_version = current_license.current_terms_version + 1,
      updated_at = decision_time, updated_by = actor_id
  where id = current_license.id
  returning * into updated_license;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(updated_license.id,'license_terms_changed',actor_id,decision_time,current_license.revision,updated_license.revision,
      audit_changed_fields,p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  insert into public.license_terms_versions(license_id,version,introduced_at_revision,plan_key,plan_version,plan_display_label,max_active_users,valid_from,valid_until)
  values(updated_license.id,updated_license.current_terms_version,updated_license.revision,
    p_plan_key,1,plan_label,plan_capacity,next_valid_from,next_valid_until);

  return updated_license;
end;
$function$;

create function public.renew_license(
  p_license_id uuid,
  p_expected_revision bigint,
  p_valid_until timestamptz,
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
  current_terms public.license_terms_versions;
  decision_time timestamptz;
  next_valid_from timestamptz;
  updated_license public.licenses;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  -- NULL p_valid_until means open-ended (Tills vidare).
  if p_license_id is null or p_expected_revision is null or p_expected_revision <= 0
    or (p_valid_until is not null and not isfinite(p_valid_until)) then
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

  decision_time := clock_timestamp();

  if current_license.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_license.status not in ('active', 'suspended') then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;
  if current_tenant.operational_status <> 'active' or current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  select * into current_terms from public.license_terms_versions
  where license_id = current_license.id and version = current_license.current_terms_version;
  if not found then
    raise exception using errcode = '23514', message = 'license history integrity violation';
  end if;
  -- Renewing an open-ended license is meaningless.
  if current_terms.valid_until is null then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  if decision_time < current_terms.valid_until then
    -- Not yet ended: keep start, move the end forward or make it open-ended.
    next_valid_from := current_terms.valid_from;
    if p_valid_until is not null and p_valid_until <= current_terms.valid_until then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;
  else
    -- Ended: the new period starts at the decision time; history keeps the gap.
    next_valid_from := decision_time;
    if p_valid_until is not null and p_valid_until <= next_valid_from then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;
  end if;

  update public.licenses
  set revision = current_license.revision + 1,
      current_terms_version = current_license.current_terms_version + 1,
      updated_at = decision_time, updated_by = actor_id
  where id = current_license.id
  returning * into updated_license;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(updated_license.id,'license_renewed',actor_id,decision_time,current_license.revision,updated_license.revision,
      array_remove(array['revision','current_terms_version',
        case when next_valid_from <> current_terms.valid_from then 'valid_from' end,
        'valid_until','updated_at','updated_by']::text[],null),
      p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  insert into public.license_terms_versions(license_id,version,introduced_at_revision,plan_key,plan_version,plan_display_label,max_active_users,valid_from,valid_until)
  values(updated_license.id,updated_license.current_terms_version,updated_license.revision,
    current_terms.plan_key,current_terms.plan_version,current_terms.plan_display_label,
    current_terms.max_active_users,next_valid_from,p_valid_until);

  return updated_license;
end;
$function$;

alter function public.change_license_terms(uuid,bigint,text,timestamptz,timestamptz,uuid) owner to postgres;
alter function public.renew_license(uuid,bigint,timestamptz,uuid) owner to postgres;

comment on function public.change_license_terms(uuid,bigint,text,timestamptz,timestamptz,uuid) is
  'F2D5C: owner+AAL2 changes terms for a draft/active/suspended license of an available Tenant. Draft replaces plan and dates under create rules; active/suspended changes plan only and preserves dates. Unchanged target is validation_error. Atomic license_terms_changed audit and one new terms version.';
comment on function public.renew_license(uuid,bigint,timestamptz,uuid) is
  'F2D5C: owner+AAL2 renews an active/suspended finite license of an available Tenant with unchanged status and plan. Not ended: keep start, later or open end. Ended: new start at decision time. Atomic license_renewed audit and one new terms version.';

revoke all privileges on function public.change_license_terms(uuid,bigint,text,timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all privileges on function public.renew_license(uuid,bigint,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.change_license_terms(uuid,bigint,text,timestamptz,timestamptz,uuid) to authenticated;
grant execute on function public.renew_license(uuid,bigint,timestamptz,uuid) to authenticated;

commit;
