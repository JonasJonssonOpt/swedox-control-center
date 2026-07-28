begin;

select no_plan();

select has_schema('private', 'private administrative schema exists');
select has_function(
  'private',
  'bootstrap_control_center_owner',
  array['uuid'],
  'the administrative bootstrap function exists'
);
select has_function(
  'private',
  'get_control_center_owner_bootstrap_status',
  array['uuid'],
  'the administrative verification function exists'
);

select is(
  (
    select proowner::regrole::text
    from pg_proc
    where oid = 'private.bootstrap_control_center_owner(uuid)'::regprocedure
  ),
  'postgres',
  'postgres owns the bootstrap function'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'private.bootstrap_control_center_owner(uuid)'::regprocedure
  ),
  false,
  'bootstrap is security invoker'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('public'),
        ('anon'),
        ('authenticated'),
        ('service_role')
    ) denied(role_name)
    where has_function_privilege(
      denied.role_name,
      'private.bootstrap_control_center_owner(uuid)',
      'EXECUTE'
    )
  ),
  0,
  'no API role can execute bootstrap'
);
select is(
  (
    select count(*)::integer
    from (
      values
        ('public'),
        ('anon'),
        ('authenticated'),
        ('service_role')
    ) denied(role_name)
    where has_function_privilege(
      denied.role_name,
      'private.get_control_center_owner_bootstrap_status(uuid)',
      'EXECUTE'
    )
  ),
  0,
  'no API role can execute bootstrap verification'
);

select is(
  private.bootstrap_control_center_owner(null),
  'invalid_input',
  'null input is rejected without a write'
);
select is(
  private.bootstrap_control_center_owner(
    '00000000-0000-4000-8000-000000000099'
  ),
  'auth_user_not_found',
  'a missing Auth user is rejected'
);
select is(
  (select count(*)::integer from public.control_center_owner),
  0,
  'rejected input leaves the singleton empty'
);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

select is(
  private.get_control_center_owner_bootstrap_status(
    '00000000-0000-4000-8000-000000000001'
  ),
  'missing_database_owner',
  'verification reports an empty singleton'
);
select is(
  private.bootstrap_control_center_owner(
    '00000000-0000-4000-8000-000000000001'
  ),
  'bootstrapped',
  'an existing Auth user bootstraps the empty singleton'
);
select is(
  (select count(*)::integer from public.control_center_owner),
  1,
  'bootstrap creates exactly one owner'
);

create temporary table owner_bootstrap_timestamp as
select created_at, updated_at
from public.control_center_owner;

select is(
  private.bootstrap_control_center_owner(
    '00000000-0000-4000-8000-000000000001'
  ),
  'already_bootstrapped',
  'the same owner is an idempotent success'
);
select is(
  (
    select count(*)::integer
    from public.control_center_owner owner_row
    join owner_bootstrap_timestamp original
      on owner_row.created_at = original.created_at
      and owner_row.updated_at = original.updated_at
  ),
  1,
  'idempotent bootstrap does not update singleton data'
);
select is(
  private.bootstrap_control_center_owner(
    '00000000-0000-4000-8000-000000000002'
  ),
  'owner_mismatch',
  'a different owner is rejected'
);
select is(
  (
    select owner_user_id
    from public.control_center_owner
  ),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'mismatch never overwrites the owner'
);

select is(
  private.get_control_center_owner_bootstrap_status(
    '00000000-0000-4000-8000-000000000001'
  ),
  'ok',
  'verification accepts the matching owner'
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',
  true
);
select is(
  public.get_owner_integrity_status(),
  'ok',
  'D2 accepts the bootstrapped authenticated owner'
);
select is(
  public.is_control_center_owner(),
  true,
  'tenant RLS helper accepts the bootstrapped owner'
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000002',
  true
);
select is(
  public.get_owner_integrity_status(),
  'authenticated_user_mismatch',
  'D2 rejects another authenticated user'
);
select is(
  public.is_control_center_owner(),
  false,
  'tenant RLS helper rejects another authenticated user'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.control_center_owner'::regclass
  ),
  'bootstrap leaves RLS and FORCE RLS enabled'
);

select * from finish();

rollback;
