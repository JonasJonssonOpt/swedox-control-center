begin;

create function public.create_license(
  p_tenant_id uuid,
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
  current_tenant public.tenants;
  created_license public.licenses;
  decision_time timestamptz;
  effective_start timestamptz;
  plan_label text;
  plan_capacity integer;
  violated_constraint text;
begin
  if not coalesce(public.is_licensing_owner_aal2(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  actor_id := auth.uid();
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_tenant_id is null or p_plan_key is null
    or p_plan_key not in ('mini', 'standard', 'stor')
    or (p_valid_from is not null and not isfinite(p_valid_from))
    or (p_valid_until is not null and not isfinite(p_valid_until)) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_tenant from public.tenants
  where id = p_tenant_id for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_tenant.operational_status <> 'active' or current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;
  if exists (select 1 from public.licenses where tenant_id = p_tenant_id and status <> 'terminated') then
    raise exception using errcode = 'P0001', message = 'duplicate_license';
  end if;

  -- clock_timestamp, not transaction-start time: capture once after lock waits.
  decision_time := clock_timestamp();
  effective_start := coalesce(p_valid_from, decision_time);
  if effective_start < decision_time
    or (p_valid_until is not null and p_valid_until <= effective_start) then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;
  plan_label := case p_plan_key when 'mini' then 'Mini' when 'standard' then 'Standard' when 'stor' then 'Stor' end;
  plan_capacity := case p_plan_key when 'mini' then 24 when 'standard' then 49 when 'stor' then 100 end;

  begin
    insert into public.licenses(tenant_id,status,revision,current_terms_version,created_at,created_by,updated_at,updated_by)
    values(p_tenant_id,'draft',1,1,decision_time,actor_id,decision_time,actor_id)
    returning * into created_license;
  exception when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'idx_licenses_tenant_non_terminated_unique' then
      raise exception using errcode = 'P0001', message = 'duplicate_license';
    end if;
    raise;
  end;

  begin
    insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_before,revision_after,changed_fields,correlation_id)
    values(created_license.id,'license_created',actor_id,decision_time,null,1,
      array_remove(array['id','tenant_id','status','revision','current_terms_version',
        'plan_key','plan_version','plan_display_label','max_active_users','valid_from',
        case when p_valid_until is not null then 'valid_until' end,
        'created_at','created_by','updated_at','updated_by']::text[],null),p_correlation_id);
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  insert into public.license_terms_versions(license_id,version,introduced_at_revision,plan_key,plan_version,plan_display_label,max_active_users,valid_from,valid_until)
  values(created_license.id,1,1,p_plan_key,1,plan_label,plan_capacity,effective_start,p_valid_until);
  return created_license;
end;
$function$;

alter function public.create_license(uuid,text,timestamptz,timestamptz,uuid) owner to postgres;
comment on function public.create_license(uuid,text,timestamptz,timestamptz,uuid) is
  'F2D5A: owner+AAL2 creates an atomic draft license/audit/terms graph for an available Tenant under a Tenant NO KEY UPDATE lock. Canonical v1 package and one post-lock decision time; no direct write grants.';
revoke all privileges on function public.create_license(uuid,text,timestamptz,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_license(uuid,text,timestamptz,timestamptz,uuid) to authenticated;
commit;
