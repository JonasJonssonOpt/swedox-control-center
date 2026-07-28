begin;

select no_plan();

select has_function(
  'public',
  'create_tenant',
  array['text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'create_tenant has the expected narrow signature'
);
select has_function(
  'public',
  'update_tenant',
  array['uuid', 'bigint', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'update_tenant has the expected narrow signature'
);
select has_function(
  'public',
  'pause_tenant',
  array['uuid', 'bigint', 'uuid'],
  'pause_tenant has the expected narrow signature'
);
select has_function(
  'public',
  'activate_tenant',
  array['uuid', 'bigint', 'uuid'],
  'activate_tenant has the expected narrow signature'
);
select has_function(
  'public',
  'archive_tenant',
  array['uuid', 'bigint', 'uuid'],
  'archive_tenant has the expected narrow signature'
);
select has_function(
  'public',
  'restore_tenant',
  array['uuid', 'bigint', 'uuid'],
  'restore_tenant has the expected narrow signature'
);

select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'create_tenant',
        'update_tenant',
        'pause_tenant',
        'activate_tenant',
        'archive_tenant',
        'restore_tenant'
      )
  ),
  6,
  'there are exactly six tenant mutation functions without overloads'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'create_tenant',
        'update_tenant',
        'pause_tenant',
        'activate_tenant',
        'archive_tenant',
        'restore_tenant'
      )
      and prosecdef
      and provolatile = 'v'
      and proparallel = 'u'
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=pg_catalog']::text[]
      and prorettype = 'public.tenants'::regtype
  ),
  6,
  'every mutation is volatile security definer with the locked owner, search path, parallel mode, and tenant return type'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('public', 'public.create_tenant(text,text,text,text,text,text,text,uuid)'),
        ('anon', 'public.create_tenant(text,text,text,text,text,text,text,uuid)'),
        ('service_role', 'public.create_tenant(text,text,text,text,text,text,text,uuid)'),
        ('public', 'public.update_tenant(uuid,bigint,text,text,text,text,text,text,uuid)'),
        ('anon', 'public.update_tenant(uuid,bigint,text,text,text,text,text,text,uuid)'),
        ('service_role', 'public.update_tenant(uuid,bigint,text,text,text,text,text,text,uuid)'),
        ('public', 'public.pause_tenant(uuid,bigint,uuid)'),
        ('anon', 'public.pause_tenant(uuid,bigint,uuid)'),
        ('service_role', 'public.pause_tenant(uuid,bigint,uuid)'),
        ('public', 'public.activate_tenant(uuid,bigint,uuid)'),
        ('anon', 'public.activate_tenant(uuid,bigint,uuid)'),
        ('service_role', 'public.activate_tenant(uuid,bigint,uuid)'),
        ('public', 'public.archive_tenant(uuid,bigint,uuid)'),
        ('anon', 'public.archive_tenant(uuid,bigint,uuid)'),
        ('service_role', 'public.archive_tenant(uuid,bigint,uuid)'),
        ('public', 'public.restore_tenant(uuid,bigint,uuid)'),
        ('anon', 'public.restore_tenant(uuid,bigint,uuid)'),
        ('service_role', 'public.restore_tenant(uuid,bigint,uuid)')
    ) as denied(role_name, function_name)
    where has_function_privilege(
      denied.role_name,
      denied.function_name,
      'EXECUTE'
    )
  ),
  0,
  'PUBLIC, anon, and service_role cannot execute tenant mutations'
);
select is(
  (
    select count(*)::integer
    from (
      values
        ('public.create_tenant(text,text,text,text,text,text,text,uuid)'),
        ('public.update_tenant(uuid,bigint,text,text,text,text,text,text,uuid)'),
        ('public.pause_tenant(uuid,bigint,uuid)'),
        ('public.activate_tenant(uuid,bigint,uuid)'),
        ('public.archive_tenant(uuid,bigint,uuid)'),
        ('public.restore_tenant(uuid,bigint,uuid)')
    ) as allowed(function_name)
    where has_function_privilege(
      'authenticated',
      allowed.function_name,
      'EXECUTE'
    )
  ),
  6,
  'authenticated can execute exactly the six tenant mutations'
);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000041'),
  ('00000000-0000-4000-8000-000000000042');

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000041',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.create_tenant('internal', null, 'Missing owner')$$,
  'P0001',
  'unauthorized',
  'create fails closed when the owner singleton is missing'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$select public.create_tenant('internal', null, 'Null auth')$$,
  'P0001',
  'unauthorized',
  'create fails closed for null auth uid'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('00000000-0000-4000-8000-000000000041');

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000042',
  true
);
set local role authenticated;
select throws_ok(
  $$select public.create_tenant('internal', null, 'Non-owner')$$,
  'P0001',
  'unauthorized',
  'a non-owner cannot create a tenant'
);
select throws_ok(
  $$select public.pause_tenant(
    '50000000-0000-4000-8000-000000000099', 1
  )$$,
  'P0001',
  'unauthorized',
  'a non-owner cannot invoke an existing-tenant mutation'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000041',
  true
);
set local role authenticated;

select lives_ok(
  $$select public.create_tenant(
    ' customer ',
    '556016-0680',
    ' Customer AB ',
    ' Contact Person ',
    'CONTACT@EXAMPLE.SE ',
    ' +46 8 123 ',
    ' Sensitive note ',
    '60000000-0000-4000-8000-000000000001'
  )$$,
  'the owner can create a valid customer'
);
select lives_ok(
  $$select public.create_tenant(
    'pilot', '5567037485', 'Pilot AB'
  )$$,
  'the owner can create a valid pilot'
);
select lives_ok(
  $$select public.create_tenant(
    'internal', null, 'Internal without number'
  )$$,
  'the owner can create an internal tenant without organization number'
);
select lives_ok(
  $$select public.create_tenant(
    'internal', '2123456788', 'Internal with number'
  )$$,
  'the owner can create an internal tenant with organization number'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.tenants
    where legal_name in (
      'Customer AB',
      'Pilot AB',
      'Internal without number',
      'Internal with number'
    )
  ),
  4,
  'all four valid create variants persist'
);
select is(
  (
    select organization_number
    from public.tenants
    where legal_name = 'Customer AB'
  ),
  '5560160680',
  'create canonicalizes organization number'
);
select is(
  (
    select contact_email
    from public.tenants
    where legal_name = 'Customer AB'
  ),
  'contact@example.se',
  'create trims and lowercases email'
);
select is(
  (
    select count(*)::integer
    from public.tenants
    where legal_name = 'Customer AB'
      and country_code = 'SE'
      and operational_status = 'active'
      and revision = 1
      and archived_at is null
      and archived_by is null
      and created_by = '00000000-0000-4000-8000-000000000041'
      and updated_by = '00000000-0000-4000-8000-000000000041'
      and id is not null
      and created_at is not null
      and updated_at is not null
  ),
  1,
  'create binds every system field in the database'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name in (
      'Customer AB',
      'Pilot AB',
      'Internal without number',
      'Internal with number'
    )
      and audit.event_type = 'tenant_created'
      and audit.actor_user_id = '00000000-0000-4000-8000-000000000041'
      and audit.revision_before is null
      and audit.revision_after = 1
  ),
  4,
  'each create writes exactly one correctly bound audit event'
);
select is(
  (
    select changed_fields
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Customer AB'
  ),
  array[
    'administrative_note',
    'category',
    'contact_email',
    'contact_name',
    'contact_phone',
    'country_code',
    'id',
    'legal_name',
    'operational_status',
    'organization_number',
    'revision'
  ]::text[],
  'create writes canonical metadata-only changed fields'
);
select is(
  (
    select correlation_id
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Customer AB'
  ),
  '60000000-0000-4000-8000-000000000001'::uuid,
  'create carries the optional synthetic correlation id'
);

select throws_ok(
  $$select public.create_tenant(
    'customer', '5560160680', 'Duplicate number'
  )$$,
  '22023',
  'validation_error',
  'duplicate organization number is a stable validation error'
);
select is(
  (select count(*)::integer from public.tenants where legal_name = 'Duplicate number'),
  0,
  'duplicate organization number creates no tenant'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Duplicate number'
  ),
  0,
  'duplicate organization number creates no audit'
);
select throws_ok(
  $$select public.create_tenant(
    'customer', 'not-an-organization-number', 'Invalid input'
  )$$,
  '22023',
  'validation_error',
  'invalid organization-number characters are rejected'
);
select throws_ok(
  $$select public.create_tenant('customer', null, 'Missing number')$$,
  '22023',
  'validation_error',
  'category-dependent tenant constraints remain enforced'
);

select lives_ok(
  $$select public.update_tenant(
    (select id from public.tenants where legal_name = 'Customer AB'),
    1,
    '5560160680',
    'Customer Updated AB',
    null,
    'new@example.se',
    null,
    'Updated note',
    '60000000-0000-4000-8000-000000000002'
  )$$,
  'the owner can update multiple editable fields'
);
select is(
  (
    select revision
    from public.tenants
    where legal_name = 'Customer Updated AB'
  ),
  2::bigint,
  'update increments revision exactly once'
);
select is(
  (
    select count(*)::integer
    from public.tenants
    where legal_name = 'Customer Updated AB'
      and category = 'customer'
      and country_code = 'SE'
      and operational_status = 'active'
      and created_by = '00000000-0000-4000-8000-000000000041'
      and updated_by = '00000000-0000-4000-8000-000000000041'
  ),
  1,
  'update preserves immutable and status fields while binding updated actor'
);
select is(
  (
    select changed_fields
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Customer Updated AB'
      and audit.revision_after = 2
  ),
  array[
    'administrative_note',
    'contact_email',
    'contact_name',
    'contact_phone',
    'legal_name'
  ]::text[],
  'update records only actually changed fields in canonical order'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Customer Updated AB'
      and audit.event_type = 'tenant_edited'
      and audit.revision_before = 1
      and audit.revision_after = 2
  ),
  1,
  'update creates exactly one tenant_edited event'
);
select throws_ok(
  $$select public.update_tenant(
    (select id from public.tenants where legal_name = 'Customer Updated AB'),
    2,
    '5560160680',
    'Customer Updated AB',
    null,
    'new@example.se',
    null,
    'Updated note'
  )$$,
  '22023',
  'validation_error',
  'a no-op update is rejected'
);
select throws_ok(
  $$select public.update_tenant(
    (select id from public.tenants where legal_name = 'Customer Updated AB'),
    1,
    '5560160680',
    'Stale update',
    null,
    'new@example.se',
    null,
    'Updated note'
  )$$,
  'P0001',
  'conflict',
  'a stale update is rejected'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Customer Updated AB'
  ),
  2,
  'failed update attempts create no audit events'
);

select lives_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 1
  )$$,
  'an active tenant can be paused'
);
select is(
  (
    select operational_status || ':' || revision::text
    from public.tenants where legal_name = 'Pilot AB'
  ),
  'paused:2',
  'pause changes status and increments revision once'
);
select is(
  (
    select event_type || ':' || array_to_string(changed_fields, ',')
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Pilot AB' and audit.revision_after = 2
  ),
  'tenant_paused:operational_status',
  'pause writes the locked audit metadata'
);
select throws_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 1
  )$$,
  'P0001',
  'conflict',
  'a second request with the same expected revision loses'
);
select is(
  (
    select revision
    from public.tenants where legal_name = 'Pilot AB'
  ),
  2::bigint,
  'sequential concurrency simulation increments revision only once'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Pilot AB' and audit.revision_after = 2
  ),
  1,
  'sequential concurrency simulation creates only one audit event'
);
select throws_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 2
  )$$,
  'P0001',
  'invalid_state_transition',
  'pause is not a silent no-op'
);
select lives_ok(
  $$select public.activate_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 2
  )$$,
  'a paused tenant can be activated'
);
select is(
  (
    select operational_status || ':' || revision::text
    from public.tenants where legal_name = 'Pilot AB'
  ),
  'active:3',
  'activate changes status and increments revision once'
);
select is(
  (
    select event_type || ':' || array_to_string(changed_fields, ',')
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Pilot AB' and audit.revision_after = 3
  ),
  'tenant_activated:operational_status',
  'activate writes the locked audit metadata'
);
select throws_ok(
  $$select public.activate_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 3
  )$$,
  'P0001',
  'invalid_state_transition',
  'activate is not a silent no-op'
);

select lives_ok(
  $$select public.archive_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 3
  )$$,
  'an active tenant can be archived'
);
select is(
  (
    select count(*)::integer
    from public.tenants
    where legal_name = 'Pilot AB'
      and archived_at is not null
      and archived_by = '00000000-0000-4000-8000-000000000041'
      and operational_status = 'active'
      and revision = 4
  ),
  1,
  'archive binds metadata without changing operational status'
);
select is(
  (
    select event_type || ':' || array_to_string(changed_fields, ',')
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Pilot AB' and audit.revision_after = 4
  ),
  'tenant_archived:archived_at,archived_by',
  'archive writes the locked audit metadata'
);
select throws_ok(
  $$select public.archive_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 4
  )$$,
  'P0001',
  'invalid_state_transition',
  'double archive is rejected'
);
select throws_ok(
  $$select public.update_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'),
    4, '5567037485', 'Archived edit', null, null, null, null
  )$$,
  'P0001',
  'invalid_state_transition',
  'an archived tenant cannot be edited'
);
select throws_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 4
  )$$,
  'P0001',
  'invalid_state_transition',
  'an archived tenant cannot be paused'
);
select lives_ok(
  $$select public.restore_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 4
  )$$,
  'an archived tenant can be restored'
);
select is(
  (
    select count(*)::integer
    from public.tenants
    where legal_name = 'Pilot AB'
      and archived_at is null
      and archived_by is null
      and operational_status = 'active'
      and revision = 5
  ),
  1,
  'restore clears archive metadata, sets active, and increments revision'
);
select is(
  (
    select event_type || ':' || array_to_string(changed_fields, ',')
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Pilot AB' and audit.revision_after = 5
  ),
  'tenant_restored:archived_at,archived_by,operational_status',
  'restore writes the locked audit metadata'
);
select throws_ok(
  $$select public.restore_tenant(
    (select id from public.tenants where legal_name = 'Pilot AB'), 5
  )$$,
  'P0001',
  'invalid_state_transition',
  'restore of an active tenant is rejected'
);

select lives_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Internal without number'), 1
  )$$,
  'a second tenant can be paused for restore-status verification'
);
select lives_ok(
  $$select public.archive_tenant(
    (select id from public.tenants where legal_name = 'Internal without number'), 2
  )$$,
  'a paused tenant can be archived'
);
select is(
  (
    select operational_status
    from public.tenants where legal_name = 'Internal without number'
  ),
  'paused',
  'archive preserves paused operational status'
);
select lives_ok(
  $$select public.restore_tenant(
    (select id from public.tenants where legal_name = 'Internal without number'), 3
  )$$,
  'a paused archived tenant can be restored'
);
select is(
  (
    select operational_status
    from public.tenants where legal_name = 'Internal without number'
  ),
  'active',
  'restore follows the locked active-status behavior'
);

select lives_ok(
  $$select public.create_tenant(
    'internal', null, 'Audit rollback tenant'
  )$$,
  'an atomicity fixture tenant is created'
);
insert into public.tenant_audit_events (
  tenant_id,
  event_type,
  actor_user_id,
  revision_before,
  revision_after,
  changed_fields
)
select
  id,
  'tenant_edited',
  '00000000-0000-4000-8000-000000000041',
  1,
  2,
  array['legal_name']
from public.tenants
where legal_name = 'Audit rollback tenant';

select throws_ok(
  $$select public.update_tenant(
    (select id from public.tenants where legal_name = 'Audit rollback tenant'),
    1, null, 'Must roll back', null, null, null, null
  )$$,
  'P0001',
  'audit_failure',
  'an audit unique failure is mapped to audit_failure'
);
select is(
  (
    select legal_name || ':' || revision::text
    from public.tenants where legal_name = 'Audit rollback tenant'
  ),
  'Audit rollback tenant:1',
  'audit failure rolls back the tenant update'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events audit
    join public.tenants tenant on tenant.id = audit.tenant_id
    where tenant.legal_name = 'Audit rollback tenant'
  ),
  2,
  'audit failure does not add a third or partial audit event'
);

select throws_ok(
  $$select public.pause_tenant(
    '50000000-0000-4000-8000-000000000099', 1
  )$$,
  'P0001',
  'not_found',
  'missing tenant produces the stable not_found error'
);
select throws_ok(
  $$select public.pause_tenant(
    (select id from public.tenants where legal_name = 'Internal with number'), 0
  )$$,
  '22023',
  'validation_error',
  'non-positive expected revision is rejected'
);

set local role authenticated;
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'internal', 'Direct insert',
      '00000000-0000-4000-8000-000000000041',
      '00000000-0000-4000-8000-000000000041'
    )$$,
  '42501',
  null,
  'authenticated still cannot insert tenants directly'
);
select throws_ok(
  'update public.tenants set legal_name = legal_name',
  '42501',
  null,
  'authenticated still cannot update tenants directly'
);
select throws_ok(
  'delete from public.tenants',
  '42501',
  null,
  'authenticated still cannot delete tenants directly'
);
select throws_ok(
  'insert into public.tenant_audit_events default values',
  '42501',
  null,
  'authenticated cannot insert audit directly'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.create_tenant('internal', null, 'Anon')$$,
  '42501',
  null,
  'anon cannot execute create_tenant'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'internal', 'Anon direct insert',
      '00000000-0000-4000-8000-000000000042',
      '00000000-0000-4000-8000-000000000042'
    )$$,
  '42501',
  null,
  'anon still cannot insert tenants directly'
);
reset role;

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ),
  0,
  'tenant write policies remain absent'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_audit_events'
  ),
  0,
  'audit policies remain absent'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname ~ 'audit'
      and proname not in (
        'prevent_installation_audit_event_modification',
        'prevent_tenant_audit_event_modification',
        'list_installation_audit_events',
        'list_tenant_audit_events'
      )
  ),
  0,
  'no client-callable audit write function exists'
);

select * from finish();

rollback;
