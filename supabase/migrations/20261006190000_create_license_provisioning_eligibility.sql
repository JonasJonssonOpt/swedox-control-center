begin;

-- F2D6: derived provisioning eligibility. Never stored, never a reservation.
-- Licensing consumes only Installation identity and its immutable Tenant
-- relation; installation status, deploy and health are not evaluated.

create function public.get_license_provisioning_eligibility(
  p_tenant_id uuid,
  p_installation_id uuid default null
)
returns table (
  eligible boolean,
  reason text,
  evaluated_at timestamptz,
  license_id uuid,
  revision bigint,
  terms_version bigint,
  valid_until timestamptz
)
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  evaluation_time timestamptz;
  target_tenant public.tenants;
  installation_tenant_id uuid;
  selected_license public.licenses;
  selected_terms public.license_terms_versions;
  decided_reason text;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_tenant_id is null then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  -- One DB evaluation time; STABLE keeps one snapshot for all reads below.
  evaluation_time := statement_timestamp();

  select * into target_tenant from public.tenants as tenant where tenant.id = p_tenant_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if p_installation_id is not null then
    select installation.tenant_id into installation_tenant_id
    from public.installations as installation
    where installation.id = p_installation_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'not_found';
    end if;
    if installation_tenant_id <> p_tenant_id then
      return query select false, 'tenant_installation_mismatch'::text, evaluation_time,
        null::uuid, null::bigint, null::bigint, null::timestamptz;
      return;
    end if;
  end if;

  if target_tenant.operational_status <> 'active' or target_tenant.archived_at is not null then
    return query select false, 'tenant_unavailable'::text, evaluation_time,
      null::uuid, null::bigint, null::bigint, null::timestamptz;
    return;
  end if;

  -- The single non-terminated license wins over any terminated history.
  select * into selected_license from public.licenses as license
  where license.tenant_id = p_tenant_id and license.status <> 'terminated';
  if not found then
    select * into selected_license from public.licenses as license
    where license.tenant_id = p_tenant_id
    order by license.created_at desc, license.id desc
    limit 1;
    if not found then
      return query select false, 'missing_license'::text, evaluation_time,
        null::uuid, null::bigint, null::bigint, null::timestamptz;
      return;
    end if;
  end if;

  select * into strict selected_terms from public.license_terms_versions as terms
  where terms.license_id = selected_license.id
    and terms.version = selected_license.current_terms_version;

  -- Administrative status blocks independent of dates; active requires valid.
  decided_reason := case
    when selected_license.status <> 'active' then selected_license.status
    when evaluation_time < selected_terms.valid_from then 'not_started'
    when selected_terms.valid_until is not null
      and evaluation_time >= selected_terms.valid_until then 'expired'
    else 'eligible'
  end;

  return query select decided_reason = 'eligible', decided_reason, evaluation_time,
    selected_license.id, selected_license.revision,
    selected_license.current_terms_version, selected_terms.valid_until;
end;
$function$;

alter function public.get_license_provisioning_eligibility(uuid,uuid) owner to postgres;
comment on function public.get_license_provisioning_eligibility(uuid,uuid) is
  'F2D6: owner+AAL2 derived provisioning eligibility at one DB time. Priority: mismatch, tenant availability, license selection, administrative status, temporal validity. Not stored and not a reservation; Provisioning must re-evaluate at start.';
revoke all privileges on function public.get_license_provisioning_eligibility(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_license_provisioning_eligibility(uuid,uuid) to authenticated;

commit;
