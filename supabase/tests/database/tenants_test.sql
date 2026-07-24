begin;

select no_plan();

select has_table('public', 'tenants', 'the tenants table exists');
select columns_are(
  'public',
  'tenants',
  array[
    'id',
    'category',
    'organization_number',
    'legal_name',
    'contact_name',
    'contact_email',
    'contact_phone',
    'country_code',
    'operational_status',
    'archived_at',
    'archived_by',
    'revision',
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'administrative_note'
  ],
  'tenants has exactly the locked seventeen columns'
);

select col_type_is('public', 'tenants', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'tenants', 'category', 'text', 'category is text');
select col_type_is(
  'public',
  'tenants',
  'organization_number',
  'text',
  'organization_number is text'
);
select col_type_is(
  'public',
  'tenants',
  'archived_at',
  'timestamp with time zone',
  'archived_at is timestamptz'
);
select col_type_is(
  'public',
  'tenants',
  'revision',
  'bigint',
  'revision is bigint'
);

select col_not_null('public', 'tenants', 'id', 'id is not null');
select col_not_null(
  'public',
  'tenants',
  'category',
  'category is not null'
);
select col_is_null(
  'public',
  'tenants',
  'organization_number',
  'organization_number is nullable for internal tenants'
);
select col_not_null(
  'public',
  'tenants',
  'legal_name',
  'legal_name is not null'
);
select col_not_null(
  'public',
  'tenants',
  'created_by',
  'created_by is not null'
);
select col_not_null(
  'public',
  'tenants',
  'updated_by',
  'updated_by is not null'
);

select col_has_default('public', 'tenants', 'id', 'id has a database default');
select col_has_default(
  'public',
  'tenants',
  'country_code',
  'country_code has a database default'
);
select col_has_default(
  'public',
  'tenants',
  'operational_status',
  'operational_status has a database default'
);
select col_has_default(
  'public',
  'tenants',
  'revision',
  'revision has a database default'
);
select col_has_default(
  'public',
  'tenants',
  'created_at',
  'created_at has a database default'
);
select col_has_default(
  'public',
  'tenants',
  'updated_at',
  'updated_at has a database default'
);

select is(
  (
    select conname
    from pg_constraint
    where conrelid = 'public.tenants'::regclass
      and contype = 'p'
  ),
  'pk_tenants',
  'the tenants primary key is explicitly named'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tenants'::regclass
      and contype = 'c'
  ),
  14,
  'all fourteen tenant check constraints exist'
);
select set_eq(
  $$select conname
    from pg_constraint
    where conrelid = 'public.tenants'::regclass
      and contype = 'c'$$,
  $$values
    ('ck_tenants_category'::name),
    ('ck_tenants_organization_number_required'::name),
    ('ck_tenants_organization_number_format'::name),
    ('ck_tenants_organization_number_valid'::name),
    ('ck_tenants_legal_name'::name),
    ('ck_tenants_contact_name'::name),
    ('ck_tenants_contact_email'::name),
    ('ck_tenants_contact_phone'::name),
    ('ck_tenants_country_code'::name),
    ('ck_tenants_operational_status'::name),
    ('ck_tenants_archive_metadata'::name),
    ('ck_tenants_revision'::name),
    ('ck_tenants_timestamps'::name),
    ('ck_tenants_administrative_note'::name)$$,
  'the named tenant constraints match the locked contract'
);

select has_function(
  'public',
  'is_valid_swedish_organization_number',
  array['text'],
  'the organization-number validator exists'
);
select function_returns(
  'public',
  'is_valid_swedish_organization_number',
  array['text'],
  'boolean',
  'the organization-number validator returns boolean'
);
select ok(
  (
    select proisstrict
    from pg_proc
    where oid =
      'public.is_valid_swedish_organization_number(text)'::regprocedure
  ),
  'the organization-number validator is strict'
);
select is(
  (
    select provolatile
    from pg_proc
    where oid =
      'public.is_valid_swedish_organization_number(text)'::regprocedure
  ),
  'i'::"char",
  'the organization-number validator is immutable'
);
select is(
  (
    select proparallel
    from pg_proc
    where oid =
      'public.is_valid_swedish_organization_number(text)'::regprocedure
  ),
  's'::"char",
  'the organization-number validator is parallel safe'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid =
      'public.is_valid_swedish_organization_number(text)'::regprocedure
  ),
  array['search_path=pg_catalog']::text[],
  'the organization-number validator has a fixed search path'
);
select ok(
  public.is_valid_swedish_organization_number('5560160680'),
  'a valid canonical organization number passes'
);
select ok(
  public.is_valid_swedish_organization_number('1012345672'),
  'a Luhn-valid sole-trader-compatible series passes'
);
select ok(
  not public.is_valid_swedish_organization_number('556016068'),
  'invalid length fails'
);
select ok(
  not public.is_valid_swedish_organization_number('5560160681'),
  'invalid Luhn checksum fails'
);
select ok(
  not public.is_valid_swedish_organization_number('55601606A0'),
  'non-digits fail'
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
    ) as denied(role_name)
    where has_function_privilege(
      denied.role_name,
      'public.is_valid_swedish_organization_number(text)',
      'EXECUTE'
    )
  ),
  0,
  'application and public roles cannot execute the validator directly'
);

select index_is_unique(
  'public',
  'tenants',
  'idx_tenants_organization_number_unique',
  'organization_number has a unique partial index'
);
select has_index(
  'public',
  'tenants',
  'idx_tenants_active_legal_name',
  array['legal_name', 'id'],
  'the active tenant list index covers legal_name and id'
);
select is(
  (
    select pg_get_expr(indpred, indrelid)
    from pg_index
    where indexrelid =
      'public.idx_tenants_organization_number_unique'::regclass
  ),
  '(organization_number IS NOT NULL)',
  'the unique organization-number index excludes only null values'
);
select is(
  (
    select pg_get_expr(indpred, indrelid)
    from pg_index
    where indexrelid = 'public.idx_tenants_active_legal_name'::regclass
  ),
  '(archived_at IS NULL)',
  'the list index targets unarchived tenants'
);

select lives_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '5560160680',
      'Synthetic Customer AB',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  'a customer with the locked defaults is valid'
);
select lives_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      contact_name,
      contact_email,
      contact_phone,
      administrative_note,
      created_by,
      updated_by
    )
    values (
      'pilot',
      '5567037485',
      'Synthetic Pilot AB',
      'Synthetic Contact',
      'synthetic@example.invalid',
      '+46 70 000 00 00',
      'Synthetic administrative note',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  'a pilot with all optional business fields is valid'
);
select lives_ok(
  $$insert into public.tenants
    (category, legal_name, operational_status, created_by, updated_by)
    values (
      'internal',
      'Synthetic Internal',
      'paused',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  'an internal tenant may omit organization_number and be paused'
);
select lives_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      archived_at,
      archived_by,
      created_by,
      updated_by
    )
    values (
      'internal',
      '1012345672',
      'Synthetic Archived Internal',
      current_timestamp,
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  'an internal tenant may use a valid number and paired archive metadata'
);

select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'unknown',
      '2123456788',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an unknown category is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'customer',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a customer without organization_number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, legal_name, created_by, updated_by)
    values (
      'pilot',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a pilot without organization_number is rejected'
);

select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '556016-0680',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a formatted organization number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an empty organization number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '          ',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a whitespace organization number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '55601606A0',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an organization number containing letters is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '556016068',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a nine-digit organization number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '55601606800',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an eleven-digit organization number is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '5560160681',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an invalid Luhn checksum is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '1012345672',
      'Duplicate',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23505',
  null,
  'an archived tenant organization number cannot be reused'
);

select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '2123456788',
      '   ',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a whitespace-only legal name is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      contact_name,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      '',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an empty contact name is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      contact_email,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      'Uppercase@Example.invalid',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a non-canonical contact email is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      administrative_note,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      repeat('x', 1001),
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an overlong administrative note is rejected'
);

select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      operational_status,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      'inactive',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'an unknown operational status is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      country_code,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      'NO',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a country other than SE is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      revision,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      0,
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'a non-positive revision is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      archived_at,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      current_timestamp,
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'archived_at without archived_by is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      archived_by,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'archived_by without archived_at is rejected'
);
select throws_ok(
  $$insert into public.tenants
    (
      category,
      organization_number,
      legal_name,
      created_at,
      updated_at,
      created_by,
      updated_by
    )
    values (
      'customer',
      '2123456788',
      'Synthetic',
      current_timestamp,
      current_timestamp - interval '1 second',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '23514',
  null,
  'updated_at before created_at is rejected'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('public', 'SELECT'),
        ('public', 'INSERT'),
        ('public', 'UPDATE'),
        ('public', 'DELETE'),
        ('public', 'TRUNCATE'),
        ('public', 'REFERENCES'),
        ('public', 'TRIGGER'),
        ('anon', 'SELECT'),
        ('anon', 'INSERT'),
        ('anon', 'UPDATE'),
        ('anon', 'DELETE'),
        ('authenticated', 'SELECT'),
        ('authenticated', 'INSERT'),
        ('authenticated', 'UPDATE'),
        ('authenticated', 'DELETE'),
        ('service_role', 'SELECT'),
        ('service_role', 'INSERT'),
        ('service_role', 'UPDATE'),
        ('service_role', 'DELETE')
    ) as denied(role_name, privilege_name)
    where has_table_privilege(
      denied.role_name,
      'public.tenants',
      denied.privilege_name
    )
  ),
  0,
  'public and application roles have no tenant table privileges'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
  ),
  0,
  'no tenant policies exist before the RLS step'
);
select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.tenants'::regclass
  ),
  false,
  'tenant RLS remains disabled until its separately reviewed step'
);

set local role anon;
select throws_ok(
  'select * from public.tenants',
  '42501',
  null,
  'anon cannot select tenants'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '9876543217',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '42501',
  null,
  'anon cannot insert tenants'
);
reset role;

set local role authenticated;
select throws_ok(
  'select * from public.tenants',
  '42501',
  null,
  'authenticated cannot select tenants'
);
select throws_ok(
  $$insert into public.tenants
    (category, organization_number, legal_name, created_by, updated_by)
    values (
      'customer',
      '9876543217',
      'Synthetic',
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000031'
    )$$,
  '42501',
  null,
  'authenticated cannot insert tenants'
);
reset role;

select * from finish();

rollback;
