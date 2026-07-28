create function public.create_installation(
  p_tenant_id uuid,
  p_installation_code text,
  p_display_name text,
  p_environment text,
  p_application_url text,
  p_supabase_project_ref text,
  p_hosting_region text,
  p_administrative_note text,
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
  tenant_available boolean;
  created_installation public.installations;
  audit_changed_fields text[];
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  select operational_status = 'active' and archived_at is null
  into tenant_available
  from public.tenants
  where id = p_tenant_id
  for key share;

  if not found or not tenant_available then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  begin
    insert into public.installations (
      tenant_id,
      installation_code,
      display_name,
      environment,
      administrative_status,
      application_url,
      supabase_project_ref,
      hosting_region,
      administrative_note,
      revision,
      created_at,
      created_by,
      updated_at,
      updated_by,
      archived_at,
      archived_by
    )
    values (
      p_tenant_id,
      lower(btrim(p_installation_code)),
      btrim(p_display_name),
      lower(btrim(p_environment)),
      'planned',
      nullif(btrim(p_application_url), ''),
      nullif(lower(btrim(p_supabase_project_ref)), ''),
      nullif(lower(btrim(p_hosting_region)), ''),
      nullif(btrim(p_administrative_note), ''),
      1,
      current_timestamp,
      actor_id,
      current_timestamp,
      actor_id,
      null,
      null
    )
    returning * into created_installation;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'duplicate_installation';
    when check_violation
      or not_null_violation
      or string_data_right_truncation
    then
      raise exception using errcode = '22023', message = 'validation_error';
  end;

  audit_changed_fields := array_remove(
    array[
      'id',
      'tenant_id',
      'installation_code',
      'display_name',
      'environment',
      'administrative_status',
      case when created_installation.application_url is not null then 'application_url' end,
      case when created_installation.supabase_project_ref is not null then 'supabase_project_ref' end,
      case when created_installation.hosting_region is not null then 'hosting_region' end,
      case when created_installation.administrative_note is not null then 'administrative_note' end,
      'revision',
      'created_at',
      'created_by',
      'updated_at',
      'updated_by'
    ]::text[],
    null
  );

  begin
    insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields, correlation_id
    )
    values (
      created_installation.id, 'installation_created', actor_id, null, 1,
      audit_changed_fields, p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return created_installation;
end;
$function$;

comment on function public.create_installation(uuid, text, text, text, text, text, text, text, uuid) is
  'Creates one planned installation for an available tenant and atomically records installation_created metadata.';

create function public.update_installation(
  p_installation_id uuid,
  p_expected_revision bigint,
  p_display_name text,
  p_application_url text,
  p_supabase_project_ref text,
  p_hosting_region text,
  p_administrative_note text,
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
  normalized_display_name text := btrim(p_display_name);
  normalized_application_url text := nullif(btrim(p_application_url), '');
  normalized_project_ref text := nullif(lower(btrim(p_supabase_project_ref)), '');
  normalized_hosting_region text := nullif(lower(btrim(p_hosting_region)), '');
  normalized_administrative_note text := nullif(btrim(p_administrative_note), '');
  audit_changed_fields text[];
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;
  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_installation
  from public.installations
  where id = p_installation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_installation.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_installation.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  select operational_status = 'active' and archived_at is null
  into tenant_available
  from public.tenants
  where id = current_installation.tenant_id
  for key share;

  if not found or not tenant_available then
    raise exception using errcode = 'P0001', message = 'tenant_not_available';
  end if;

  audit_changed_fields := array_remove(
    array[
      case when current_installation.display_name is distinct from normalized_display_name then 'display_name' end,
      case when current_installation.application_url is distinct from normalized_application_url then 'application_url' end,
      case when current_installation.supabase_project_ref is distinct from normalized_project_ref then 'supabase_project_ref' end,
      case when current_installation.hosting_region is distinct from normalized_hosting_region then 'hosting_region' end,
      case when current_installation.administrative_note is distinct from normalized_administrative_note then 'administrative_note' end,
      'revision',
      'updated_at',
      'updated_by'
    ]::text[],
    null
  );

  if cardinality(audit_changed_fields) = 3 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  begin
    update public.installations
    set
      display_name = normalized_display_name,
      application_url = normalized_application_url,
      supabase_project_ref = normalized_project_ref,
      hosting_region = normalized_hosting_region,
      administrative_note = normalized_administrative_note,
      revision = current_installation.revision + 1,
      updated_at = current_timestamp,
      updated_by = actor_id
    where id = current_installation.id
    returning * into updated_installation;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'duplicate_installation';
    when check_violation
      or not_null_violation
      or string_data_right_truncation
    then
      raise exception using errcode = '22023', message = 'validation_error';
  end;

  begin
    insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields, correlation_id
    )
    values (
      updated_installation.id, 'installation_edited', actor_id,
      current_installation.revision, updated_installation.revision,
      audit_changed_fields, p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_installation;
end;
$function$;

comment on function public.update_installation(uuid, bigint, text, text, text, text, text, uuid) is
  'Updates only safe metadata on an unarchived installation with tenant availability, optimistic concurrency, and atomic audit.';

create function public.activate_installation(
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
    or current_installation.application_url is null
    or current_installation.supabase_project_ref is null
    or current_installation.hosting_region is null
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

comment on function public.activate_installation(uuid, bigint, uuid) is
  'Activates a metadata-complete planned or paused installation with optimistic concurrency and atomic audit.';

create function public.pause_installation(
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
    or current_installation.administrative_status <> 'active'
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
  set administrative_status = 'paused',
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
      updated_installation.id, 'installation_paused', actor_id,
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

comment on function public.pause_installation(uuid, bigint, uuid) is
  'Pauses an unarchived active installation with tenant availability, optimistic concurrency, and atomic audit.';

create function public.decommission_installation(
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
    or current_installation.administrative_status = 'decommissioned'
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
  set administrative_status = 'decommissioned',
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
      updated_installation.id, 'installation_decommissioned', actor_id,
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

comment on function public.decommission_installation(uuid, bigint, uuid) is
  'Terminally decommissions an unarchived planned, active, or paused installation with atomic audit.';

create function public.archive_installation(
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
    or current_installation.administrative_status <> 'decommissioned'
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
  set archived_at = current_timestamp,
      archived_by = actor_id,
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
      updated_installation.id, 'installation_archived', actor_id,
      current_installation.revision, updated_installation.revision,
      array['revision', 'updated_at', 'updated_by', 'archived_at', 'archived_by'],
      p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;
  return updated_installation;
end;
$function$;

comment on function public.archive_installation(uuid, bigint, uuid) is
  'Archives only an unarchived decommissioned installation while preserving its terminal status.';

create function public.restore_installation(
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
  if current_installation.archived_at is null
    or current_installation.administrative_status <> 'decommissioned'
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
  set archived_at = null,
      archived_by = null,
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
      updated_installation.id, 'installation_restored', actor_id,
      current_installation.revision, updated_installation.revision,
      array['revision', 'updated_at', 'updated_by', 'archived_at', 'archived_by'],
      p_correlation_id
    );
  exception when others then
    raise exception using errcode = 'P0001', message = 'audit_failure';
  end;
  return updated_installation;
end;
$function$;

comment on function public.restore_installation(uuid, bigint, uuid) is
  'Restores only visibility of an archived decommissioned installation and preserves terminal status.';

revoke execute on function public.create_installation(uuid, text, text, text, text, text, text, text, uuid) from public;
revoke execute on function public.create_installation(uuid, text, text, text, text, text, text, text, uuid) from anon;
revoke execute on function public.create_installation(uuid, text, text, text, text, text, text, text, uuid) from service_role;
grant execute on function public.create_installation(uuid, text, text, text, text, text, text, text, uuid) to authenticated;

revoke execute on function public.update_installation(uuid, bigint, text, text, text, text, text, uuid) from public;
revoke execute on function public.update_installation(uuid, bigint, text, text, text, text, text, uuid) from anon;
revoke execute on function public.update_installation(uuid, bigint, text, text, text, text, text, uuid) from service_role;
grant execute on function public.update_installation(uuid, bigint, text, text, text, text, text, uuid) to authenticated;

revoke execute on function public.activate_installation(uuid, bigint, uuid) from public;
revoke execute on function public.activate_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.activate_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.activate_installation(uuid, bigint, uuid) to authenticated;

revoke execute on function public.pause_installation(uuid, bigint, uuid) from public;
revoke execute on function public.pause_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.pause_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.pause_installation(uuid, bigint, uuid) to authenticated;

revoke execute on function public.decommission_installation(uuid, bigint, uuid) from public;
revoke execute on function public.decommission_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.decommission_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.decommission_installation(uuid, bigint, uuid) to authenticated;

revoke execute on function public.archive_installation(uuid, bigint, uuid) from public;
revoke execute on function public.archive_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.archive_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.archive_installation(uuid, bigint, uuid) to authenticated;

revoke execute on function public.restore_installation(uuid, bigint, uuid) from public;
revoke execute on function public.restore_installation(uuid, bigint, uuid) from anon;
revoke execute on function public.restore_installation(uuid, bigint, uuid) from service_role;
grant execute on function public.restore_installation(uuid, bigint, uuid) to authenticated;
