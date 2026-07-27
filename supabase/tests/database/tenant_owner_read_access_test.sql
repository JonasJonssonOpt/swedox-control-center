begin;

select no_plan();

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenants'::regclass),
  'tenant RLS is enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.tenants'::regclass),
  'tenant RLS is forced'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public' and tablename = 'tenants'
  ),
  1,
  'tenants has exactly one policy'
);
select is(
  (
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'tenants'
  ),
  'tenants_owner_select',
  'the owner SELECT policy has the expected name'
);
select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_select'
  ),
  'SELECT',
  'the owner policy applies only to SELECT'
);
select is(
  (
    select roles
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_owner_select'
  ),
  array['authenticated']::name[],
  'the owner policy applies only to authenticated'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ),
  0,
  'tenants has no write or ALL policies'
);

select has_function(
  'public',
  'is_control_center_owner',
  array[]::text[],
  'the owner policy helper exists without arguments'
);
select function_returns(
  'public',
  'is_control_center_owner',
  array[]::text[],
  'boolean',
  'the owner policy helper returns boolean'
);
select is(
  (
    select pronargs::integer
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  0,
  'the owner policy helper accepts no arguments'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  'the owner policy helper is security definer'
);
select is(
  (
    select provolatile
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  's'::"char",
  'the owner policy helper is stable'
);
select is(
  (
    select proparallel
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  'u'::"char",
  'the owner policy helper is parallel unsafe'
);
select is(
  (
    select proowner::regrole::text
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  'postgres',
  'postgres owns the owner policy helper'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.is_control_center_owner()'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'the owner policy helper has a fixed pg_catalog search path'
);
select ok(
  not has_function_privilege('public', 'public.is_control_center_owner()', 'EXECUTE'),
  'PUBLIC cannot execute the owner policy helper'
);
select ok(
  not has_function_privilege('anon', 'public.is_control_center_owner()', 'EXECUTE'),
  'anon cannot execute the owner policy helper'
);
select ok(
  has_function_privilege('authenticated', 'public.is_control_center_owner()', 'EXECUTE'),
  'authenticated can execute the owner policy helper'
);
select ok(
  not has_function_privilege('service_role', 'public.is_control_center_owner()', 'EXECUTE'),
  'service_role cannot execute the owner policy helper'
);

select ok(
  not has_table_privilege(
    'public',
    'public.tenants',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'PUBLIC has no tenant table privileges'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.tenants',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'anon has no tenant table privileges'
);
select ok(
  has_table_privilege('authenticated', 'public.tenants', 'SELECT'),
  'authenticated has tenant SELECT'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.tenants',
    'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'authenticated has no tenant write or broad privileges'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.tenants',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'service_role received no tenant table grant'
);
select is(
  (
    select count(*)::integer
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'tenants'
      and grantee = 'authenticated'
      and privilege_type = 'SELECT'
  ),
  17,
  'authenticated SELECT covers all seventeen tenant columns'
);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000022');

insert into public.tenants (
  id,
  category,
  organization_number,
  legal_name,
  created_by,
  updated_by
)
values (
  '10000000-0000-4000-8000-000000000001',
  'customer',
  '5560160680',
  'Active test tenant',
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000021'
);
insert into public.tenants (
  id,
  category,
  organization_number,
  legal_name,
  archived_at,
  archived_by,
  created_by,
  updated_by
)
values (
  '10000000-0000-4000-8000-000000000002',
  'pilot',
  '5561034249',
  'Archived test tenant',
  current_timestamp,
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000021'
);

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000021',
  true
);
set local role authenticated;
select is(
  public.is_control_center_owner(),
  false,
  'the helper fails closed when the singleton is missing'
);
select is(
  (select count(*)::integer from public.tenants),
  0,
  'an authenticated user sees no tenants when the singleton is missing'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('00000000-0000-4000-8000-000000000021');

set local role authenticated;
select is(public.is_control_center_owner(), true, 'the matching owner passes the helper');
select is(
  (select count(*)::integer from public.tenants),
  2,
  'the owner reads active and archived tenants'
);
select is(
  (
    select count(*)::integer
    from public.tenants
    where id = '10000000-0000-4000-8000-000000000002'
  ),
  1,
  'the owner can filter an archived tenant by id'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'internal',
      'Denied insert',
      '00000000-0000-4000-8000-000000000021',
      '00000000-0000-4000-8000-000000000021'
    )$$,
  '42501',
  null,
  'the owner cannot insert tenants directly'
);
select throws_ok(
  $$update public.tenants set legal_name = 'Denied update'
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'the owner cannot update tenants directly'
);
select throws_ok(
  $$delete from public.tenants
    where id = '10000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'the owner cannot delete tenants directly'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000022',
  true
);
set local role authenticated;
select is(public.is_control_center_owner(), false, 'a non-owner fails the helper');
select is(
  (select count(*)::integer from public.tenants),
  0,
  'a non-owner reads no tenant rows'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'internal',
      'Denied insert',
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000022'
    )$$,
  '42501',
  null,
  'a non-owner cannot insert tenants'
);
select throws_ok(
  $$update public.tenants set legal_name = 'Denied update'$$,
  '42501',
  null,
  'a non-owner cannot update tenants'
);
select throws_ok(
  'delete from public.tenants',
  '42501',
  null,
  'a non-owner cannot delete tenants'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is(public.is_control_center_owner(), false, 'null auth uid fails the helper');
select is(
  (select count(*)::integer from public.tenants),
  0,
  'null auth uid reads no tenant rows'
);
reset role;

set local role anon;
select throws_ok(
  'select * from public.tenants',
  '42501',
  null,
  'anon cannot select tenants'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'internal',
      'Denied anon insert',
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000022'
    )$$,
  '42501',
  null,
  'anon cannot insert tenants'
);
select throws_ok(
  $$update public.tenants set legal_name = 'Denied anon update'$$,
  '42501',
  null,
  'anon cannot update tenants'
);
select throws_ok(
  'delete from public.tenants',
  '42501',
  null,
  'anon cannot delete tenants'
);
select throws_ok(
  'select public.is_control_center_owner()',
  '42501',
  null,
  'anon cannot query owner-check state'
);
reset role;

select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000022')$$,
  '23505',
  null,
  'the singleton invariant prevents a multiple-owner state'
);
select throws_ok(
  $$delete from auth.users
    where id = '00000000-0000-4000-8000-000000000021'$$,
  '23503',
  null,
  'the owner FK prevents a dangling Auth owner'
);

select * from finish();

rollback;
