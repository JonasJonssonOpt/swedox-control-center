begin;

select no_plan();

select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in (
       'create_installation', 'update_installation', 'activate_installation',
       'pause_installation', 'decommission_installation',
       'archive_installation', 'restore_installation'
     )),
  7,
  'exactly seven installation mutation functions exist'
);

select has_function(
  'public', 'create_installation',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'create signature is locked'
);
select has_function(
  'public', 'update_installation',
  array['uuid', 'bigint', 'text', 'text', 'text', 'text', 'text', 'uuid'],
  'update signature is locked'
);
select has_function('public', 'activate_installation', array['uuid', 'bigint', 'uuid'], 'activate signature is locked');
select has_function('public', 'pause_installation', array['uuid', 'bigint', 'uuid'], 'pause signature is locked');
select has_function('public', 'decommission_installation', array['uuid', 'bigint', 'uuid'], 'decommission signature is locked');
select has_function('public', 'archive_installation', array['uuid', 'bigint', 'uuid'], 'archive signature is locked');
select has_function('public', 'restore_installation', array['uuid', 'bigint', 'uuid'], 'restore signature is locked');

select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in (
       'create_installation', 'update_installation', 'activate_installation',
       'pause_installation', 'decommission_installation',
       'archive_installation', 'restore_installation'
     )
     and prosecdef
     and provolatile = 'v'
     and proparallel = 'u'
     and proowner = 'postgres'::regrole
     and proconfig = array['search_path=pg_catalog']::text[]
     and pg_get_function_result(oid) = 'installations'),
  7,
  'all mutation functions have locked security and execution metadata'
);
select is(
  (select count(*)::integer from pg_description d
   join pg_proc p on p.oid = d.objoid
   where p.pronamespace = 'public'::regnamespace
     and p.proname in (
       'create_installation', 'update_installation', 'activate_installation',
       'pause_installation', 'decommission_installation',
       'archive_installation', 'restore_installation'
     )
     and d.description <> ''),
  7,
  'all mutation functions are documented'
);

select is(
  (select count(*)::integer
   from (
     select oid from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname in (
         'create_installation', 'update_installation', 'activate_installation',
         'pause_installation', 'decommission_installation',
         'archive_installation', 'restore_installation'
       )
   ) functions
   cross join (values ('public'), ('anon'), ('service_role')) denied(role_name)
   where has_function_privilege(role_name, functions.oid, 'EXECUTE')),
  0,
  'PUBLIC, anon, and service_role cannot execute installation mutations'
);
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in (
       'create_installation', 'update_installation', 'activate_installation',
       'pause_installation', 'decommission_installation',
       'archive_installation', 'restore_installation'
     )
     and has_function_privilege('authenticated', oid, 'EXECUTE')),
  7,
  'authenticated can execute all seven guarded mutations'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'installation-mutation-owner@example.invalid', '',
    current_timestamp, current_timestamp, current_timestamp, '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'installation-mutation-other@example.invalid', '',
    current_timestamp, current_timestamp, current_timestamp, '', '', '', ''
  );
insert into public.control_center_owner (owner_user_id)
values ('40000000-0000-4000-8000-000000000001');

insert into public.tenants (
  id, category, legal_name, operational_status, archived_at, archived_by,
  created_by, updated_by
) values
  (
    '40000000-0000-4000-8000-000000000011', 'internal', 'Active Installation Tenant',
    'active', null, null,
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000012', 'internal', 'Paused Installation Tenant',
    'paused', null, null,
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000013', 'internal', 'Archived Installation Tenant',
    'active', current_timestamp, '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'non-owner-create',
    'Non-owner', 'production', null, null, null, null, null
  )$$,
  'P0001', 'unauthorized', 'authenticated non-owner cannot create'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'null-auth-create',
    'Null auth', 'production', null, null, null, null, null
  )$$,
  'P0001', 'unauthorized', 'null auth cannot create'
);
reset role;

delete from public.control_center_owner;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'missing-owner-create',
    'Missing owner', 'production', null, null, null, null, null
  )$$,
  'P0001', 'unauthorized', 'missing singleton cannot create'
);
reset role;
insert into public.control_center_owner (owner_user_id)
values ('40000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'mismatch-create',
    'Mismatch', 'production', null, null, null, null, null
  )$$,
  'P0001', 'unauthorized', 'owner mismatch cannot create'
);
reset role;
delete from public.control_center_owner;
insert into public.control_center_owner (owner_user_id)
values ('40000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-production',
    'Production', 'production', 'https://production.example.invalid',
    'projectproduction', 'eu-north-1', 'Initial note',
    '40000000-0000-4000-8000-000000000091'
  )$$,
  'owner creates production'
);
select lives_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-production-two',
    'Production Two', 'production', null, null, null, null, null
  )$$,
  'same tenant may have another production installation'
);
select lives_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-staging',
    'Staging', 'staging', null, null, null, null, null
  )$$,
  'owner creates staging'
);
select lives_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-test',
    'Test', 'test', null, null, null, null, null
  )$$,
  'owner creates test'
);
select lives_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-development',
    'Development', 'development', null, null, null, null, null
  )$$,
  'owner creates development'
);

select is(
  (select administrative_status from public.installations where installation_code = 'create-production'),
  'planned',
  'create forces planned status'
);
select is(
  (select revision from public.installations where installation_code = 'create-production'),
  1::bigint,
  'create forces revision one'
);
select is(
  (select created_by from public.installations where installation_code = 'create-production'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'create binds actor to auth.uid'
);
select ok(
  (select archived_at is null and archived_by is null
   from public.installations where installation_code = 'create-production'),
  'create forces empty archive metadata'
);
reset role;
select is(
  (select count(*)::integer from public.installation_audit_events e
   join public.installations i on i.id = e.installation_id
   where i.installation_code = 'create-production'
     and e.event_type = 'installation_created'
     and e.actor_user_id = '40000000-0000-4000-8000-000000000001'
     and e.revision_before is null
     and e.revision_after = 1
     and e.correlation_id = '40000000-0000-4000-8000-000000000091'),
  1,
  'create writes exactly one bound audit event'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000012', 'paused-tenant-create',
    'Paused tenant', 'production', null, null, null, null, null
  )$$,
  'P0001', 'tenant_not_available', 'paused tenant blocks create'
);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000013', 'archived-tenant-create',
    'Archived tenant', 'production', null, null, null, null, null
  )$$,
  'P0001', 'tenant_not_available', 'archived tenant blocks create'
);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000404', 'missing-tenant-create',
    'Missing tenant', 'production', null, null, null, null, null
  )$$,
  'P0001', 'tenant_not_available', 'missing tenant blocks create'
);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'create-production',
    'Duplicate code', 'production', null, null, null, null, null
  )$$,
  'P0001', 'duplicate_installation', 'duplicate code maps stably'
);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'duplicate-project',
    'Duplicate project', 'production', null, 'projectproduction', null, null, null
  )$$,
  'P0001', 'duplicate_installation', 'duplicate project ref maps stably'
);
select throws_ok(
  $$select public.create_installation(
    '40000000-0000-4000-8000-000000000011', 'invalid environment',
    '', 'preview', 'http://unsafe.invalid', null, null, null, null
  )$$,
  '22023', 'validation_error', 'invalid create input maps stably'
);
reset role;
select is(
  (select count(*)::integer from public.installation_audit_events e
   join public.installations i on i.id = e.installation_id
   where i.installation_code in ('paused-tenant-create', 'archived-tenant-create', 'duplicate-project')),
  0,
  'failed creates write no audit'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    1, 'Production Renamed', 'https://production.example.invalid',
    'projectproduction', 'eu-north-1', 'Initial note',
    '40000000-0000-4000-8000-000000000092'
  )$$,
  'update changes one safe field'
);
reset role;
select is(
  (select changed_fields from public.installation_audit_events e
   join public.installations i on i.id = e.installation_id
   where i.installation_code = 'create-production' and e.revision_after = 2),
  array['display_name', 'revision', 'updated_at', 'updated_by']::text[],
  'update audits only the changed field plus system revision metadata'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    2, 'Production Renamed Again', null, null, null, null, null
  )$$,
  'update changes multiple fields and clears nullable metadata'
);
select ok(
  (select application_url is null and supabase_project_ref is null
     and hosting_region is null and administrative_note is null
   from public.installations where installation_code = 'create-production'),
  'update explicitly sets nullable fields to null'
);
select throws_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    3, 'Production Renamed Again', null, null, null, null, null
  )$$,
  '22023', 'validation_error', 'update no-op is rejected'
);
select throws_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    2, 'Stale', null, null, null, null, null
  )$$,
  'P0001', 'conflict', 'stale update is rejected before state'
);

reset role;
update public.tenants set operational_status = 'paused'
where id = '40000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    3, 'Blocked', null, null, null, null, null
  )$$,
  'P0001', 'tenant_not_available', 'paused tenant blocks update'
);
reset role;
update public.tenants set operational_status = 'active'
where id = '40000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.activate_installation(
    (select id from public.installations where installation_code = 'create-production'),
    3, null
  )$$,
  'planned installation activates without technical metadata'
);
select lives_ok(
  $$select public.pause_installation(
    (select id from public.installations where installation_code = 'create-production'),
    4, null
  )$$,
  'active installation pauses'
);
select lives_ok(
  $$select public.activate_installation(
    (select id from public.installations where installation_code = 'create-production'),
    5, null
  )$$,
  'paused installation activates without technical metadata'
);
select ok(
  (select application_url is null
     and supabase_project_ref is null
     and hosting_region is null
     and administrative_status = 'active'
     and revision = 6
   from public.installations where installation_code = 'create-production'),
  'activation preserves absent technical metadata and increments revision'
);
reset role;
select is(
  (select count(*)::integer from public.installation_audit_events e
   join public.installations i on i.id = e.installation_id
   where i.installation_code = 'create-production'
     and e.event_type = 'installation_activated'
     and e.changed_fields =
       array['administrative_status', 'revision', 'updated_at', 'updated_by']::text[]
     and e.revision_after in (4, 6)),
  2,
  'planned activation and reactivation each write one canonical audit event'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.activate_installation(
    (select id from public.installations where installation_code = 'create-production'),
    6, null
  )$$,
  'P0001', 'invalid_state_transition', 'active to active is rejected'
);
select throws_ok(
  $$select public.pause_installation(
    (select id from public.installations where installation_code = 'create-staging'),
    1, null
  )$$,
  'P0001', 'invalid_state_transition', 'planned installation cannot pause'
);

select lives_ok(
  $$select public.decommission_installation(
    (select id from public.installations where installation_code = 'create-staging'),
    1, null
  )$$,
  'planned installation decommissions'
);
select lives_ok(
  $$select public.decommission_installation(
    (select id from public.installations where installation_code = 'create-production'),
    6, null
  )$$,
  'active installation decommissions'
);
select lives_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    7, 'Decommissioned Metadata', 'https://ready.example.invalid',
    'projectready', 'eu-north-1', 'Safe update', null
  )$$,
  'decommissioned but unarchived metadata remains editable'
);
select throws_ok(
  $$select public.decommission_installation(
    (select id from public.installations where installation_code = 'create-production'),
    8, null
  )$$,
  'P0001', 'invalid_state_transition', 'decommission is terminal'
);

select throws_ok(
  $$select public.archive_installation(
    (select id from public.installations where installation_code = 'create-test'),
    1, null
  )$$,
  'P0001', 'invalid_state_transition', 'planned installation cannot archive'
);
select lives_ok(
  $$select public.archive_installation(
    (select id from public.installations where installation_code = 'create-production'),
    8, null
  )$$,
  'decommissioned installation archives'
);
select ok(
  (select administrative_status = 'decommissioned'
     and archived_at is not null
     and archived_by = '40000000-0000-4000-8000-000000000001'
   from public.installations where installation_code = 'create-production'),
  'archive preserves terminal status and binds actor'
);
select throws_ok(
  $$select public.update_installation(
    (select id from public.installations where installation_code = 'create-production'),
    9, 'Archived edit', null, null, null, null, null
  )$$,
  'P0001', 'invalid_state_transition', 'archived installation cannot update'
);
select throws_ok(
  $$select public.archive_installation(
    (select id from public.installations where installation_code = 'create-production'),
    9, null
  )$$,
  'P0001', 'invalid_state_transition', 'already archived installation cannot archive'
);
select lives_ok(
  $$select public.restore_installation(
    (select id from public.installations where installation_code = 'create-production'),
    9, null
  )$$,
  'archived installation restores visibility'
);
select ok(
  (select administrative_status = 'decommissioned'
     and archived_at is null and archived_by is null
   from public.installations where installation_code = 'create-production'),
  'restore preserves terminal status and does not activate'
);
select throws_ok(
  $$select public.restore_installation(
    (select id from public.installations where installation_code = 'create-production'),
    10, null
  )$$,
  'P0001', 'invalid_state_transition', 'visible installation cannot restore'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.activate_installation(
    (select id from public.installations where installation_code = 'create-test'),
    1, null
  )$$,
  'first sequential attempt succeeds'
);
select throws_ok(
  $$select public.pause_installation(
    (select id from public.installations where installation_code = 'create-test'),
    1, null
  )$$,
  'P0001', 'conflict', 'second sequential attempt with stale revision conflicts'
);
select is(
  (select revision from public.installations where installation_code = 'create-test'),
  2::bigint,
  'concurrent fixture revision increments once'
);
reset role;
select is(
  (select count(*)::integer from public.installation_audit_events e
   join public.installations i on i.id = e.installation_id
   where i.installation_code = 'create-test' and e.revision_after = 2),
  1,
  'concurrent fixture has exactly one audit event for next revision'
);
insert into public.installation_audit_events (
  installation_id, event_type, actor_user_id, revision_before,
  revision_after, changed_fields
) values (
  (select id from public.installations where installation_code = 'create-development'),
  'installation_edited',
  '40000000-0000-4000-8000-000000000001',
  1, 2, array['display_name', 'revision', 'updated_at', 'updated_by']
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.activate_installation(
    (select id from public.installations where installation_code = 'create-development'),
    1, null
  )$$,
  'P0001', 'audit_failure', 'activation audit collision maps to audit_failure'
);
select is(
  (select administrative_status from public.installations where installation_code = 'create-development'),
  'planned',
  'audit failure rolls back administrative activation'
);
select is(
  (select revision from public.installations where installation_code = 'create-development'),
  1::bigint,
  'audit failure rolls back revision'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('installations', 'installation_audit_events')
     and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'no installation or audit write policy exists'
);
select throws_ok(
  $$insert into public.installations (
    tenant_id, installation_code, display_name, environment, created_by, updated_by
  ) values (
    '40000000-0000-4000-8000-000000000011', 'direct-write',
    'Direct write', 'production',
    '40000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'authenticated direct installation write remains blocked'
);
select throws_ok(
  $$insert into public.installation_audit_events (
    installation_id, event_type, actor_user_id,
    revision_before, revision_after, changed_fields
  ) values (
    (select id from public.installations where installation_code = 'create-development'),
    'installation_edited',
    '40000000-0000-4000-8000-000000000001',
    1, 2, array['display_name']
  )$$,
  '42501', null, 'authenticated direct audit write remains blocked'
);
reset role;

set local role anon;
select throws_ok(
  $$select public.pause_installation(
    '40000000-0000-4000-8000-000000000404', 1, null
  )$$,
  '42501', null, 'anon cannot execute installation mutations'
);
reset role;

select * from finish();

rollback;
