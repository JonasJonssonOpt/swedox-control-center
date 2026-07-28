begin;

select no_plan();

select is(
  (select relrowsecurity from pg_class where oid = 'public.installations'::regclass),
  true,
  'installation RLS is enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.installations'::regclass),
  true,
  'installation FORCE RLS is enabled'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'installations'),
  1,
  'installations has exactly one policy'
);
select is(
  (select policyname from pg_policies where schemaname = 'public' and tablename = 'installations'),
  'installations_owner_select',
  'the policy has the locked name'
);
select is(
  (select cmd from pg_policies where schemaname = 'public' and tablename = 'installations'),
  'SELECT',
  'the policy applies only to SELECT'
);
select is(
  (select roles from pg_policies where schemaname = 'public' and tablename = 'installations'),
  array['authenticated']::name[],
  'the policy applies only to authenticated'
);
select is(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'installations'),
  'is_control_center_owner()',
  'the policy delegates only to the existing owner helper'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'installations'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'no installation write policy exists'
);

select ok(
  has_table_privilege('authenticated', 'public.installations', 'SELECT'),
  'authenticated has SELECT'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('service_role')) denied(role_name)
   where has_table_privilege(role_name, 'public.installations', 'SELECT')),
  0,
  'PUBLIC, anon, and service_role lack SELECT'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege_name)
   where has_table_privilege(role_name, 'public.installations', privilege_name)),
  0,
  'all API roles lack every installation write and structural privilege'
);
select ok(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  'local service_role has platform BYPASSRLS'
);
select ok(
  not has_table_privilege('service_role', 'public.installations', 'SELECT'),
  'service_role has no installation business grant'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'installations'
     and 'service_role' = any(roles)),
  0,
  'service_role belongs to no installation policy'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'installation-owner@example.invalid', '',
    current_timestamp, current_timestamp, current_timestamp, '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'installation-non-owner@example.invalid', '',
    current_timestamp, current_timestamp, current_timestamp, '', '', '', ''
  );

insert into public.control_center_owner (owner_user_id)
values ('20000000-0000-4000-8000-000000000001');

insert into public.tenants (
  id, category, legal_name, archived_at, archived_by, created_by, updated_by
) values
  (
    '20000000-0000-4000-8000-000000000011',
    'internal', 'Readable Tenant', null, null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000012',
    'internal', 'Archived Readable Tenant', current_timestamp,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.installations (
  id, tenant_id, installation_code, display_name, environment,
  administrative_status, archived_at, archived_by, created_by, updated_by
) values
  (
    '20000000-0000-4000-8000-000000000021',
    '20000000-0000-4000-8000-000000000011',
    'read-planned', 'Planned', 'production', 'planned', null, null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000022',
    '20000000-0000-4000-8000-000000000011',
    'read-active', 'Active', 'staging', 'active', null, null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000023',
    '20000000-0000-4000-8000-000000000011',
    'read-paused', 'Paused', 'test', 'paused', null, null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000024',
    '20000000-0000-4000-8000-000000000011',
    'read-archived', 'Archived', 'development', 'decommissioned',
    current_timestamp, '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '20000000-0000-4000-8000-000000000025',
    '20000000-0000-4000-8000-000000000012',
    'read-archived-tenant', 'Archived Tenant Installation', 'production', 'active',
    null, null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);

select ok(public.is_control_center_owner(), 'the matching authenticated owner passes the helper');
select is((select count(*)::integer from public.installations), 5, 'owner reads every installation');
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'installations'
     and has_column_privilege('authenticated', 'public.installations', column_name, 'SELECT')),
  17,
  'owner has SELECT access to all seventeen columns'
);
select is(
  (select installation_code from public.installations where id = '20000000-0000-4000-8000-000000000024'),
  'read-archived',
  'owner can filter and read an archived installation by ID'
);
select is(
  (select count(*)::integer from public.installations
   where tenant_id = '20000000-0000-4000-8000-000000000011'),
  4,
  'owner can filter installations by tenant ID'
);
select is(
  (select count(*)::integer from public.installations
   where tenant_id = '20000000-0000-4000-8000-000000000012'),
  1,
  'owner reads an installation belonging to an archived tenant'
);
select set_eq(
  $$select administrative_status from public.installations$$,
  $$values ('planned'::text), ('active'::text), ('paused'::text), ('decommissioned'::text)$$,
  'owner reads every administrative status'
);

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select ok(not public.is_control_center_owner(), 'authenticated non-owner fails the helper');
select is((select count(*)::integer from public.installations), 0, 'authenticated non-owner receives zero rows');
select throws_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, created_by, updated_by)
    values (
      '20000000-0000-4000-8000-000000000011', 'forbidden-insert',
      'Forbidden', 'production',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002'
    )$$,
  '42501', null, 'authenticated non-owner cannot insert'
);
select throws_ok(
  $$update public.installations set display_name = 'Forbidden'
    where id = '20000000-0000-4000-8000-000000000021'$$,
  '42501', null, 'authenticated non-owner cannot update'
);
select throws_ok(
  $$delete from public.installations
    where id = '20000000-0000-4000-8000-000000000021'$$,
  '42501', null, 'authenticated non-owner cannot delete'
);

select set_config('request.jwt.claim.sub', '', true);
select ok(not public.is_control_center_owner(), 'null-equivalent auth fails the helper');
select is((select count(*)::integer from public.installations), 0, 'null auth receives zero rows');

reset role;
delete from public.control_center_owner;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select ok(not public.is_control_center_owner(), 'missing owner singleton fails the helper');
select is((select count(*)::integer from public.installations), 0, 'missing owner singleton returns zero rows');

reset role;
insert into public.control_center_owner (owner_user_id)
values ('20000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select ok(not public.is_control_center_owner(), 'owner mismatch fails the helper');
select is((select count(*)::integer from public.installations), 0, 'owner mismatch returns zero rows');
reset role;

set local role anon;
select throws_ok('select * from public.installations', '42501', null, 'anon cannot select installations');
select throws_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, created_by, updated_by)
    values (
      '20000000-0000-4000-8000-000000000011', 'anon-insert',
      'Anon', 'production',
      '20000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002'
    )$$,
  '42501', null, 'anon cannot insert installations'
);
reset role;

select * from finish();

rollback;
