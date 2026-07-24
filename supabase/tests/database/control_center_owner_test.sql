begin;

select no_plan();

select has_table(
  'public',
  'control_center_owner',
  'control_center_owner exists in public'
);

select columns_are(
  'public',
  'control_center_owner',
  array['singleton_key', 'owner_user_id', 'created_at', 'updated_at'],
  'control_center_owner has exactly the expected four columns'
);

select col_type_is(
  'public',
  'control_center_owner',
  'singleton_key',
  'smallint',
  'singleton_key is smallint'
);
select col_type_is(
  'public',
  'control_center_owner',
  'owner_user_id',
  'uuid',
  'owner_user_id is uuid'
);
select col_type_is(
  'public',
  'control_center_owner',
  'created_at',
  'timestamp with time zone',
  'created_at is timestamptz'
);
select col_type_is(
  'public',
  'control_center_owner',
  'updated_at',
  'timestamp with time zone',
  'updated_at is timestamptz'
);

select col_not_null(
  'public',
  'control_center_owner',
  'singleton_key',
  'singleton_key is not null'
);
select col_not_null(
  'public',
  'control_center_owner',
  'owner_user_id',
  'owner_user_id is not null'
);
select col_not_null(
  'public',
  'control_center_owner',
  'created_at',
  'created_at is not null'
);
select col_not_null(
  'public',
  'control_center_owner',
  'updated_at',
  'updated_at is not null'
);

select col_has_default(
  'public',
  'control_center_owner',
  'singleton_key',
  'singleton_key has a database default'
);
select col_has_default(
  'public',
  'control_center_owner',
  'created_at',
  'created_at has a database default'
);
select col_has_default(
  'public',
  'control_center_owner',
  'updated_at',
  'updated_at has a database default'
);
select col_hasnt_default(
  'public',
  'control_center_owner',
  'owner_user_id',
  'owner_user_id has no default'
);

select is(
  (
    select count(*)::integer
    from public.control_center_owner
  ),
  0,
  'the migration leaves the singleton empty for bootstrap'
);

select is(
  (
    select relowner::regrole::text
    from pg_class
    where oid = 'public.control_center_owner'::regclass
  ),
  'postgres',
  'postgres owns the singleton table'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.control_center_owner'::regclass
  ),
  'row level security is enabled'
);
select ok(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.control_center_owner'::regclass
  ),
  'row level security is forced'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'control_center_owner'
  ),
  0,
  'the singleton has no permissive policies'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.control_center_owner'::regclass
      and contype = 'p'
      and conname = 'pk_control_center_owner'
  ),
  1,
  'the named primary key exists'
);
select is(
  (
    select array_agg(att.attname order by key_position)
    from pg_constraint con
    cross join lateral unnest(con.conkey) with ordinality as key(attnum, key_position)
    join pg_attribute att
      on att.attrelid = con.conrelid
      and att.attnum = key.attnum
    where con.conrelid = 'public.control_center_owner'::regclass
      and con.conname = 'pk_control_center_owner'
  ),
  array['singleton_key']::name[],
  'the primary key covers singleton_key'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.control_center_owner'::regclass
      and contype = 'c'
      and conname = 'ck_control_center_owner_singleton_key'
  ),
  1,
  'the named singleton check exists'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.control_center_owner'::regclass
      and contype = 'u'
      and conname = 'uq_control_center_owner_owner_user_id'
  ),
  1,
  'the named owner UUID unique constraint exists'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.control_center_owner'::regclass
      and contype = 'c'
      and conname = 'ck_control_center_owner_updated_at'
  ),
  1,
  'the named timestamp check exists'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.control_center_owner'::regclass
      and contype = 'f'
      and conname = 'fk_control_center_owner_owner_user_id'
      and confrelid = 'auth.users'::regclass
      and confdeltype = 'r'
  ),
  1,
  'the named owner FK references auth.users with delete restrict'
);

select throws_ok(
  $$insert into public.control_center_owner (singleton_key, owner_user_id)
    values (2, '00000000-0000-4000-8000-000000000099')$$,
  '23514',
  null,
  'a singleton key other than one is rejected'
);
select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000099')$$,
  '23503',
  null,
  'an owner UUID without an Auth user is rejected'
);
select throws_ok(
  $$insert into public.control_center_owner
    (owner_user_id, created_at, updated_at)
    values (
      '00000000-0000-4000-8000-000000000099',
      current_timestamp,
      current_timestamp - interval '1 second'
    )$$,
  '23514',
  null,
  'updated_at before created_at is rejected'
);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

select lives_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000001')$$,
  'a synthetic Auth user can be referenced by the privileged test role'
);
select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000002')$$,
  '23505',
  null,
  'a second logical singleton row is rejected by the primary key'
);
select throws_ok(
  $$delete from auth.users
    where id = '00000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'the referenced Auth owner cannot be deleted'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('anon', 'SELECT'),
        ('anon', 'INSERT'),
        ('anon', 'UPDATE'),
        ('anon', 'DELETE'),
        ('anon', 'TRUNCATE'),
        ('anon', 'REFERENCES'),
        ('anon', 'TRIGGER'),
        ('authenticated', 'SELECT'),
        ('authenticated', 'INSERT'),
        ('authenticated', 'UPDATE'),
        ('authenticated', 'DELETE'),
        ('authenticated', 'TRUNCATE'),
        ('authenticated', 'REFERENCES'),
        ('authenticated', 'TRIGGER')
    ) as required_denial(role_name, privilege_name)
    where has_table_privilege(
      required_denial.role_name,
      'public.control_center_owner',
      required_denial.privilege_name
    )
  ),
  0,
  'anon and authenticated have none of the prohibited table privileges'
);
select ok(
  not has_table_privilege(
    'public',
    'public.control_center_owner',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'PUBLIC has none of the prohibited table privileges'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.control_center_owner',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'service_role has no direct singleton table privileges'
);

set local role anon;
select throws_ok(
  'select * from public.control_center_owner',
  '42501',
  null,
  'anon cannot select the singleton'
);
select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000002')$$,
  '42501',
  null,
  'anon cannot insert the singleton'
);
select throws_ok(
  'update public.control_center_owner set updated_at = current_timestamp',
  '42501',
  null,
  'anon cannot update the singleton'
);
select throws_ok(
  'delete from public.control_center_owner',
  '42501',
  null,
  'anon cannot delete the singleton'
);
reset role;

set local role authenticated;
select throws_ok(
  'select * from public.control_center_owner',
  '42501',
  null,
  'authenticated cannot select the singleton'
);
select throws_ok(
  $$insert into public.control_center_owner (owner_user_id)
    values ('00000000-0000-4000-8000-000000000002')$$,
  '42501',
  null,
  'authenticated cannot insert the singleton'
);
select throws_ok(
  'update public.control_center_owner set updated_at = current_timestamp',
  '42501',
  null,
  'authenticated cannot update the singleton'
);
select throws_ok(
  'delete from public.control_center_owner',
  '42501',
  null,
  'authenticated cannot delete the singleton'
);
reset role;

select * from finish();

rollback;
