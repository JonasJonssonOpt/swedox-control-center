begin;

select no_plan();

select has_function(
  'public',
  'get_owner_integrity_status',
  array[]::text[],
  'the owner integrity function exists with no arguments'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'get_owner_integrity_status'
  ),
  1,
  'the owner integrity function has no unexpected overloads'
);
select function_returns(
  'public',
  'get_owner_integrity_status',
  array[]::text[],
  'text',
  'the owner integrity function returns text'
);
select is(
  (
    select pronargs::integer
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  0,
  'the owner integrity function accepts no arguments'
);
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  'the owner integrity function is security definer'
);
select is(
  (
    select provolatile
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  's'::"char",
  'the owner integrity function is stable'
);
select is(
  (
    select proparallel
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  'u'::"char",
  'the owner integrity function is parallel unsafe'
);
select is(
  (
    select proowner::regrole::text
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  'postgres',
  'postgres owns the owner integrity function'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'the owner integrity function has a fixed pg_catalog search path'
);
select is(
  (
    select proleakproof
    from pg_proc
    where oid = 'public.get_owner_integrity_status()'::regprocedure
  ),
  false,
  'the owner integrity function is not marked leakproof'
);

select ok(
  not has_function_privilege(
    'public',
    'public.get_owner_integrity_status()',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the owner integrity function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.get_owner_integrity_status()',
    'EXECUTE'
  ),
  'anon cannot execute the owner integrity function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.get_owner_integrity_status()',
    'EXECUTE'
  ),
  'authenticated can execute the owner integrity function'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.get_owner_integrity_status()',
    'EXECUTE'
  ),
  'service_role has no explicit owner integrity execute path'
);

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is(
  auth.uid(),
  null,
  'the local unauthenticated test context produces a null auth uid'
);
select is(
  public.get_owner_integrity_status(),
  'unauthenticated',
  'unauthenticated execution does not reveal an empty singleton'
);
reset role;

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012');

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000011',
  true
);
set local role authenticated;
select is(
  auth.uid(),
  '00000000-0000-4000-8000-000000000011'::uuid,
  'the local authenticated test context produces the synthetic owner identity'
);
select is(
  public.get_owner_integrity_status(),
  'missing_database_owner',
  'an authenticated caller receives the missing singleton status'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('00000000-0000-4000-8000-000000000011');

set local role authenticated;
select is(
  public.get_owner_integrity_status(),
  'ok',
  'the matching authenticated owner receives ok'
);
select ok(
  public.get_owner_integrity_status() = any(
    array[
      'ok',
      'unauthenticated',
      'missing_database_owner',
      'invalid_database_owner_state',
      'authenticated_user_mismatch'
    ]
  ),
  'the result is one of the allowlisted categories'
);
select ok(
  public.get_owner_integrity_status() !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'the result is not an identifier'
);
select ok(
  length(public.get_owner_integrity_status()) <= 31,
  'the result has bounded categorical length'
);
select throws_ok(
  'select * from public.control_center_owner',
  '42501',
  null,
  'authenticated still cannot select the singleton'
);
select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000012')$$,
  '42501',
  null,
  'authenticated still cannot insert the singleton'
);
select throws_ok(
  'update public.control_center_owner set updated_at = current_timestamp',
  '42501',
  null,
  'authenticated still cannot update the singleton'
);
select throws_ok(
  'delete from public.control_center_owner',
  '42501',
  null,
  'authenticated still cannot delete the singleton'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000012',
  true
);
set local role authenticated;
select is(
  auth.uid(),
  '00000000-0000-4000-8000-000000000012'::uuid,
  'the local authenticated test context can switch to another synthetic identity'
);
select is(
  public.get_owner_integrity_status(),
  'authenticated_user_mismatch',
  'another authenticated user receives only the mismatch category'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select is(
  public.get_owner_integrity_status(),
  'unauthenticated',
  'unauthenticated execution does not reveal a configured singleton'
);
reset role;

set local role anon;
select throws_ok(
  'select public.get_owner_integrity_status()',
  '42501',
  null,
  'anon cannot execute the owner integrity function'
);
reset role;

set local role service_role;
select throws_ok(
  'select public.get_owner_integrity_status()',
  '42501',
  null,
  'service_role has no owner integrity execute path'
);
reset role;

select * from finish();

rollback;
