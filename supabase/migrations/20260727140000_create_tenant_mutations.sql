create function public.create_tenant(
  p_category text,
  p_organization_number text,
  p_legal_name text,
  p_contact_name text default null,
  p_contact_email text default null,
  p_contact_phone text default null,
  p_administrative_note text default null,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  normalized_organization_number text;
  created_tenant public.tenants;
  audit_changed_fields text[];
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_organization_number is not null then
    if p_organization_number !~ '^[0-9[:space:]-]+$' then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;

    normalized_organization_number :=
      regexp_replace(p_organization_number, '[[:space:]-]', '', 'g');
  end if;

  begin
    insert into public.tenants (
      category,
      organization_number,
      legal_name,
      contact_name,
      contact_email,
      contact_phone,
      country_code,
      operational_status,
      archived_at,
      archived_by,
      revision,
      created_at,
      created_by,
      updated_at,
      updated_by,
      administrative_note
    )
    values (
      btrim(p_category),
      normalized_organization_number,
      btrim(p_legal_name),
      case when p_contact_name is null then null else btrim(p_contact_name) end,
      case when p_contact_email is null then null else lower(btrim(p_contact_email)) end,
      case when p_contact_phone is null then null else btrim(p_contact_phone) end,
      'SE',
      'active',
      null,
      null,
      1,
      current_timestamp,
      actor_id,
      current_timestamp,
      actor_id,
      case
        when p_administrative_note is null then null
        else btrim(p_administrative_note)
      end
    )
    returning * into created_tenant;
  exception
    when check_violation
      or unique_violation
      or not_null_violation
      or string_data_right_truncation
    then
      raise exception using errcode = '22023', message = 'validation_error';
  end;

  audit_changed_fields := array_remove(
    array[
      case when created_tenant.administrative_note is not null then 'administrative_note' end,
      'category',
      case when created_tenant.contact_email is not null then 'contact_email' end,
      case when created_tenant.contact_name is not null then 'contact_name' end,
      case when created_tenant.contact_phone is not null then 'contact_phone' end,
      'country_code',
      'id',
      'legal_name',
      'operational_status',
      case
        when created_tenant.organization_number is not null
        then 'organization_number'
      end,
      'revision'
    ]::text[],
    null
  );

  begin
    insert into public.tenant_audit_events (
      tenant_id,
      event_type,
      actor_user_id,
      revision_before,
      revision_after,
      changed_fields,
      correlation_id
    )
    values (
      created_tenant.id,
      'tenant_created',
      actor_id,
      null,
      1,
      audit_changed_fields,
      p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return created_tenant;
end;
$function$;

comment on function public.create_tenant(text, text, text, text, text, text, text, uuid) is
  'Creates one active tenant at revision one and atomically records tenant_created audit metadata.';

create function public.update_tenant(
  p_tenant_id uuid,
  p_expected_revision bigint,
  p_organization_number text,
  p_legal_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_administrative_note text,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_tenant public.tenants;
  updated_tenant public.tenants;
  normalized_organization_number text;
  normalized_legal_name text := btrim(p_legal_name);
  normalized_contact_name text :=
    case when p_contact_name is null then null else btrim(p_contact_name) end;
  normalized_contact_email text :=
    case when p_contact_email is null then null else lower(btrim(p_contact_email)) end;
  normalized_contact_phone text :=
    case when p_contact_phone is null then null else btrim(p_contact_phone) end;
  normalized_administrative_note text :=
    case
      when p_administrative_note is null then null
      else btrim(p_administrative_note)
    end;
  audit_changed_fields text[];
  next_revision bigint;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  if p_organization_number is not null then
    if p_organization_number !~ '^[0-9[:space:]-]+$' then
      raise exception using errcode = '22023', message = 'validation_error';
    end if;

    normalized_organization_number :=
      regexp_replace(p_organization_number, '[[:space:]-]', '', 'g');
  end if;

  select *
  into current_tenant
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if current_tenant.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;

  if current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  audit_changed_fields := array_remove(
    array[
      case
        when current_tenant.administrative_note
          is distinct from normalized_administrative_note
        then 'administrative_note'
      end,
      case
        when current_tenant.contact_email is distinct from normalized_contact_email
        then 'contact_email'
      end,
      case
        when current_tenant.contact_name is distinct from normalized_contact_name
        then 'contact_name'
      end,
      case
        when current_tenant.contact_phone is distinct from normalized_contact_phone
        then 'contact_phone'
      end,
      case
        when current_tenant.legal_name is distinct from normalized_legal_name
        then 'legal_name'
      end,
      case
        when current_tenant.organization_number
          is distinct from normalized_organization_number
        then 'organization_number'
      end
    ]::text[],
    null
  );

  if cardinality(audit_changed_fields) = 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  next_revision := current_tenant.revision + 1;

  begin
    update public.tenants
    set
      organization_number = normalized_organization_number,
      legal_name = normalized_legal_name,
      contact_name = normalized_contact_name,
      contact_email = normalized_contact_email,
      contact_phone = normalized_contact_phone,
      administrative_note = normalized_administrative_note,
      revision = next_revision,
      updated_at = current_timestamp,
      updated_by = actor_id
    where id = current_tenant.id
    returning * into updated_tenant;
  exception
    when check_violation
      or unique_violation
      or not_null_violation
      or string_data_right_truncation
    then
      raise exception using errcode = '22023', message = 'validation_error';
  end;

  begin
    insert into public.tenant_audit_events (
      tenant_id,
      event_type,
      actor_user_id,
      revision_before,
      revision_after,
      changed_fields,
      correlation_id
    )
    values (
      updated_tenant.id,
      'tenant_edited',
      actor_id,
      current_tenant.revision,
      updated_tenant.revision,
      audit_changed_fields,
      p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_tenant;
end;
$function$;

comment on function public.update_tenant(uuid, bigint, text, text, text, text, text, text, uuid) is
  'Updates only editable fields on an unarchived tenant with optimistic concurrency and atomic audit.';

create function public.pause_tenant(
  p_tenant_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_tenant public.tenants;
  updated_tenant public.tenants;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_tenant
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_tenant.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_tenant.archived_at is not null
    or current_tenant.operational_status <> 'active'
  then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.tenants
  set
    operational_status = 'paused',
    revision = current_tenant.revision + 1,
    updated_at = current_timestamp,
    updated_by = actor_id
  where id = current_tenant.id
  returning * into updated_tenant;

  begin
    insert into public.tenant_audit_events (
      tenant_id, event_type, actor_user_id, revision_before, revision_after,
      changed_fields, correlation_id
    )
    values (
      updated_tenant.id, 'tenant_paused', actor_id, current_tenant.revision,
      updated_tenant.revision, array['operational_status'], p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_tenant;
end;
$function$;

comment on function public.pause_tenant(uuid, bigint, uuid) is
  'Changes an unarchived active tenant to paused with optimistic concurrency and atomic audit.';

create function public.activate_tenant(
  p_tenant_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_tenant public.tenants;
  updated_tenant public.tenants;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_tenant
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_tenant.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_tenant.archived_at is not null
    or current_tenant.operational_status <> 'paused'
  then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.tenants
  set
    operational_status = 'active',
    revision = current_tenant.revision + 1,
    updated_at = current_timestamp,
    updated_by = actor_id
  where id = current_tenant.id
  returning * into updated_tenant;

  begin
    insert into public.tenant_audit_events (
      tenant_id, event_type, actor_user_id, revision_before, revision_after,
      changed_fields, correlation_id
    )
    values (
      updated_tenant.id, 'tenant_activated', actor_id, current_tenant.revision,
      updated_tenant.revision, array['operational_status'], p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_tenant;
end;
$function$;

comment on function public.activate_tenant(uuid, bigint, uuid) is
  'Changes an unarchived paused tenant to active with optimistic concurrency and atomic audit.';

create function public.archive_tenant(
  p_tenant_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_tenant public.tenants;
  updated_tenant public.tenants;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_tenant
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_tenant.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_tenant.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.tenants
  set
    archived_at = current_timestamp,
    archived_by = actor_id,
    revision = current_tenant.revision + 1,
    updated_at = current_timestamp,
    updated_by = actor_id
  where id = current_tenant.id
  returning * into updated_tenant;

  begin
    insert into public.tenant_audit_events (
      tenant_id, event_type, actor_user_id, revision_before, revision_after,
      changed_fields, correlation_id
    )
    values (
      updated_tenant.id, 'tenant_archived', actor_id, current_tenant.revision,
      updated_tenant.revision, array['archived_at', 'archived_by'], p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_tenant;
end;
$function$;

comment on function public.archive_tenant(uuid, bigint, uuid) is
  'Archives a tenant without changing operational status and atomically records tenant_archived.';

create function public.restore_tenant(
  p_tenant_id uuid,
  p_expected_revision bigint,
  p_correlation_id uuid default null
)
returns public.tenants
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  actor_id uuid := auth.uid();
  current_tenant public.tenants;
  updated_tenant public.tenants;
begin
  if actor_id is null or not coalesce(public.is_control_center_owner(), false) then
    raise exception using errcode = 'P0001', message = 'unauthorized';
  end if;

  if p_expected_revision is null or p_expected_revision <= 0 then
    raise exception using errcode = '22023', message = 'validation_error';
  end if;

  select * into current_tenant
  from public.tenants
  where id = p_tenant_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if current_tenant.revision <> p_expected_revision then
    raise exception using errcode = 'P0001', message = 'conflict';
  end if;
  if current_tenant.archived_at is null then
    raise exception using errcode = 'P0001', message = 'invalid_state_transition';
  end if;

  update public.tenants
  set
    archived_at = null,
    archived_by = null,
    operational_status = 'active',
    revision = current_tenant.revision + 1,
    updated_at = current_timestamp,
    updated_by = actor_id
  where id = current_tenant.id
  returning * into updated_tenant;

  begin
    insert into public.tenant_audit_events (
      tenant_id, event_type, actor_user_id, revision_before, revision_after,
      changed_fields, correlation_id
    )
    values (
      updated_tenant.id, 'tenant_restored', actor_id, current_tenant.revision,
      updated_tenant.revision,
      array['archived_at', 'archived_by', 'operational_status'],
      p_correlation_id
    );
  exception
    when others then
      raise exception using errcode = 'P0001', message = 'audit_failure';
  end;

  return updated_tenant;
end;
$function$;

comment on function public.restore_tenant(uuid, bigint, uuid) is
  'Restores an archived tenant to active and atomically records tenant_restored.';

revoke execute on function public.create_tenant(text, text, text, text, text, text, text, uuid) from public;
revoke execute on function public.create_tenant(text, text, text, text, text, text, text, uuid) from anon;
revoke execute on function public.create_tenant(text, text, text, text, text, text, text, uuid) from service_role;
grant execute on function public.create_tenant(text, text, text, text, text, text, text, uuid) to authenticated;

revoke execute on function public.update_tenant(uuid, bigint, text, text, text, text, text, text, uuid) from public;
revoke execute on function public.update_tenant(uuid, bigint, text, text, text, text, text, text, uuid) from anon;
revoke execute on function public.update_tenant(uuid, bigint, text, text, text, text, text, text, uuid) from service_role;
grant execute on function public.update_tenant(uuid, bigint, text, text, text, text, text, text, uuid) to authenticated;

revoke execute on function public.pause_tenant(uuid, bigint, uuid) from public;
revoke execute on function public.pause_tenant(uuid, bigint, uuid) from anon;
revoke execute on function public.pause_tenant(uuid, bigint, uuid) from service_role;
grant execute on function public.pause_tenant(uuid, bigint, uuid) to authenticated;

revoke execute on function public.activate_tenant(uuid, bigint, uuid) from public;
revoke execute on function public.activate_tenant(uuid, bigint, uuid) from anon;
revoke execute on function public.activate_tenant(uuid, bigint, uuid) from service_role;
grant execute on function public.activate_tenant(uuid, bigint, uuid) to authenticated;

revoke execute on function public.archive_tenant(uuid, bigint, uuid) from public;
revoke execute on function public.archive_tenant(uuid, bigint, uuid) from anon;
revoke execute on function public.archive_tenant(uuid, bigint, uuid) from service_role;
grant execute on function public.archive_tenant(uuid, bigint, uuid) to authenticated;

revoke execute on function public.restore_tenant(uuid, bigint, uuid) from public;
revoke execute on function public.restore_tenant(uuid, bigint, uuid) from anon;
revoke execute on function public.restore_tenant(uuid, bigint, uuid) from service_role;
grant execute on function public.restore_tenant(uuid, bigint, uuid) to authenticated;
