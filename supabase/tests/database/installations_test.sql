begin;

select no_plan();

select has_table('public', 'installations', 'the installations table exists');
select columns_are(
  'public',
  'installations',
  array[
    'id',
    'tenant_id',
    'installation_code',
    'display_name',
    'environment',
    'administrative_status',
    'application_url',
    'supabase_project_ref',
    'hosting_region',
    'administrative_note',
    'revision',
    'created_at',
    'created_by',
    'updated_at',
    'updated_by',
    'archived_at',
    'archived_by'
  ],
  'installations has exactly the locked seventeen columns in order'
);

select col_type_is('public', 'installations', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'installations', 'tenant_id', 'uuid', 'tenant_id is uuid');
select col_type_is('public', 'installations', 'installation_code', 'text', 'installation_code is text');
select col_type_is('public', 'installations', 'display_name', 'text', 'display_name is text');
select col_type_is('public', 'installations', 'environment', 'text', 'environment is text');
select col_type_is('public', 'installations', 'administrative_status', 'text', 'administrative_status is text');
select col_type_is('public', 'installations', 'application_url', 'text', 'application_url is text');
select col_type_is('public', 'installations', 'supabase_project_ref', 'text', 'supabase_project_ref is text');
select col_type_is('public', 'installations', 'hosting_region', 'text', 'hosting_region is text');
select col_type_is('public', 'installations', 'administrative_note', 'text', 'administrative_note is text');
select col_type_is('public', 'installations', 'revision', 'bigint', 'revision is bigint');
select col_type_is('public', 'installations', 'created_at', 'timestamp with time zone', 'created_at is timestamptz');
select col_type_is('public', 'installations', 'updated_at', 'timestamp with time zone', 'updated_at is timestamptz');
select col_type_is('public', 'installations', 'created_by', 'uuid', 'created_by is uuid');
select col_type_is('public', 'installations', 'updated_by', 'uuid', 'updated_by is uuid');
select col_type_is('public', 'installations', 'archived_at', 'timestamp with time zone', 'archived_at is timestamptz');
select col_type_is('public', 'installations', 'archived_by', 'uuid', 'archived_by is uuid');

select col_not_null('public', 'installations', 'id', 'id is required');
select col_not_null('public', 'installations', 'tenant_id', 'tenant_id is required');
select col_not_null('public', 'installations', 'installation_code', 'installation_code is required');
select col_not_null('public', 'installations', 'display_name', 'display_name is required');
select col_not_null('public', 'installations', 'environment', 'environment is required');
select col_not_null('public', 'installations', 'administrative_status', 'administrative_status is required');
select col_not_null('public', 'installations', 'revision', 'revision is required');
select col_not_null('public', 'installations', 'created_at', 'created_at is required');
select col_not_null('public', 'installations', 'created_by', 'created_by is required');
select col_not_null('public', 'installations', 'updated_at', 'updated_at is required');
select col_not_null('public', 'installations', 'updated_by', 'updated_by is required');
select col_is_null('public', 'installations', 'application_url', 'application_url is nullable');
select col_is_null('public', 'installations', 'supabase_project_ref', 'supabase_project_ref is nullable');
select col_is_null('public', 'installations', 'hosting_region', 'hosting_region is nullable');
select col_is_null('public', 'installations', 'administrative_note', 'administrative_note is nullable');
select col_is_null('public', 'installations', 'archived_at', 'archived_at is nullable');
select col_is_null('public', 'installations', 'archived_by', 'archived_by is nullable');

select col_has_default('public', 'installations', 'id', 'id has a default');
select col_has_default('public', 'installations', 'administrative_status', 'status has a default');
select col_has_default('public', 'installations', 'revision', 'revision has a default');
select col_has_default('public', 'installations', 'created_at', 'created_at has a default');
select col_has_default('public', 'installations', 'updated_at', 'updated_at has a default');
select col_hasnt_default('public', 'installations', 'environment', 'environment requires explicit input');

select is(
  (select conname from pg_constraint where conrelid = 'public.installations'::regclass and contype = 'p'),
  'pk_installations',
  'primary key is explicitly named'
);
select is(
  (select confdeltype from pg_constraint where conrelid = 'public.installations'::regclass and conname = 'fk_installations_tenant'),
  'r'::"char",
  'tenant foreign key uses delete restrict'
);
select set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.installations'::regclass and contype = 'c'$$,
  $$values
    ('ck_installations_installation_code'::name),
    ('ck_installations_display_name'::name),
    ('ck_installations_environment'::name),
    ('ck_installations_administrative_status'::name),
    ('ck_installations_application_url'::name),
    ('ck_installations_supabase_project_ref'::name),
    ('ck_installations_hosting_region'::name),
    ('ck_installations_administrative_note'::name),
    ('ck_installations_revision'::name),
    ('ck_installations_timestamps'::name),
    ('ck_installations_archive_metadata'::name)$$,
  'all named installation checks match the locked contract'
);

insert into public.tenants
  (id, category, legal_name, created_by, updated_by)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'internal',
    'Installation Test Tenant',
    '10000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000099'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'internal',
    'Empty Test Tenant',
    '10000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000099'
  );

select lives_ok(
  $$insert into public.installations
    (
      tenant_id, installation_code, display_name, environment,
      application_url, supabase_project_ref, hosting_region,
      administrative_note, created_by, updated_by
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'opticon-prod-se', 'Opticon Production', 'production',
      'https://opticon.example.invalid/app?source=control-center',
      'abcdefghijklmnopqrst', 'eu-north-1',
      'Confidential installation note',
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000099'
    )$$,
  'a complete canonical installation is valid'
);
select is(
  (select administrative_status from public.installations where installation_code = 'opticon-prod-se'),
  'planned',
  'administrative status defaults to planned'
);
select is(
  (select revision from public.installations where installation_code = 'opticon-prod-se'),
  1::bigint,
  'revision defaults to one'
);

select lives_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, created_by, updated_by)
    values
    ('10000000-0000-4000-8000-000000000001', 'second-prod', 'Second Production', 'production',
     '10000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099')$$,
  'one tenant may have multiple production installations'
);

select lives_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, administrative_status, created_by, updated_by)
    values
    ('10000000-0000-4000-8000-000000000001', 'status-active', 'Active', 'staging', 'active',
     '10000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099'),
    ('10000000-0000-4000-8000-000000000001', 'status-paused', 'Paused', 'test', 'paused',
     '10000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099'),
    ('10000000-0000-4000-8000-000000000001', 'status-decommissioned', 'Decommissioned', 'development', 'decommissioned',
     '10000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000099')$$,
  'all locked environments and explicit statuses are valid'
);

select lives_ok(
  $$insert into public.installations
    (
      tenant_id, installation_code, display_name, environment,
      supabase_project_ref, archived_at, archived_by, created_by, updated_by
    )
    values (
      '10000000-0000-4000-8000-000000000001', 'archived-prod',
      'Archived Production', 'production', 'archivedprojectref', current_timestamp,
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000099'
    )$$,
  'paired archive metadata is valid independently of status'
);

create function pg_temp.expect_installation_check(
  code text,
  name text default 'Valid Name',
  env text default 'production',
  status text default 'planned',
  url text default null,
  project_ref text default null,
  region text default null,
  note text default null,
  rev bigint default 1,
  archived_time timestamp with time zone default null,
  archived_actor uuid default null,
  created_time timestamp with time zone default current_timestamp,
  updated_time timestamp with time zone default current_timestamp
) returns text
language plpgsql
as $$
begin
  insert into public.installations (
    tenant_id, installation_code, display_name, environment,
    administrative_status, application_url, supabase_project_ref,
    hosting_region, administrative_note, revision, archived_at, archived_by,
    created_at, updated_at, created_by, updated_by
  ) values (
    '10000000-0000-4000-8000-000000000001', code, name, env,
    status, url, project_ref, region, note, rev, archived_time, archived_actor,
    created_time, updated_time,
    '10000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000099'
  );
  return 'accepted';
exception when others then
  return sqlstate;
end;
$$;

select is(pg_temp.expect_installation_check('Uppercase'), '23514', 'uppercase installation code is rejected');
select is(pg_temp.expect_installation_check(' spaced'), '23514', 'installation code whitespace is rejected');
select is(pg_temp.expect_installation_check('-leading'), '23514', 'leading hyphen is rejected');
select is(pg_temp.expect_installation_check('trailing-'), '23514', 'trailing hyphen is rejected');
select is(pg_temp.expect_installation_check('double--hyphen'), '23514', 'double hyphen is rejected');
select is(pg_temp.expect_installation_check('under_score'), '23514', 'underscore is rejected');
select is(pg_temp.expect_installation_check(''), '23514', 'empty installation code is rejected');
select is(pg_temp.expect_installation_check(repeat('a', 65)), '23514', 'overlong installation code is rejected');
select is(pg_temp.expect_installation_check('opticon-prod-se'), '23505', 'duplicate installation code is rejected');
select is(pg_temp.expect_installation_check('archived-prod'), '23505', 'archived installation code cannot be reused');

select is(pg_temp.expect_installation_check('name-empty', ''), '23514', 'empty display name is rejected');
select is(pg_temp.expect_installation_check('name-space', '   '), '23514', 'whitespace display name is rejected');
select is(pg_temp.expect_installation_check('name-leading', ' Leading'), '23514', 'leading display-name whitespace is rejected');
select is(pg_temp.expect_installation_check('name-trailing', 'Trailing '), '23514', 'trailing display-name whitespace is rejected');
select is(pg_temp.expect_installation_check('name-double', 'Double  Space'), '23514', 'non-normalized display-name whitespace is rejected');
select is(pg_temp.expect_installation_check('name-long', repeat('n', 121)), '23514', 'overlong display name is rejected');

select is(pg_temp.expect_installation_check('env-pilot', env => 'pilot'), '23514', 'pilot environment is rejected');
select is(pg_temp.expect_installation_check('env-prod', env => 'prod'), '23514', 'prod environment is rejected');
select is(pg_temp.expect_installation_check('env-preview', env => 'preview'), '23514', 'preview environment is rejected');
select is(pg_temp.expect_installation_check('env-upper', env => 'Production'), '23514', 'uppercase environment is rejected');
select is(pg_temp.expect_installation_check('status-invalid', status => 'provisioning'), '23514', 'non-administrative status is rejected');

select is(pg_temp.expect_installation_check('url-http', url => 'http://example.invalid'), '23514', 'HTTP URL is rejected');
select is(pg_temp.expect_installation_check('url-creds', url => 'https://user:pass@example.invalid'), '23514', 'URL credentials are rejected');
select is(pg_temp.expect_installation_check('url-fragment', url => 'https://example.invalid/#secret'), '23514', 'URL fragment is rejected');
select is(pg_temp.expect_installation_check('url-relative', url => '/relative'), '23514', 'relative URL is rejected');
select is(pg_temp.expect_installation_check('url-space', url => 'https://example.invalid/a b'), '23514', 'URL whitespace is rejected');
select is(pg_temp.expect_installation_check('url-long', url => 'https://' || repeat('a', 2041)), '23514', 'overlong URL is rejected');
select is(pg_temp.expect_installation_check('url-malformed', url => 'https://'), '23514', 'malformed URL is rejected');

select is(pg_temp.expect_installation_check('project-upper', project_ref => 'ProjectRef'), '23514', 'uppercase project ref is rejected');
select is(pg_temp.expect_installation_check('project-space', project_ref => 'project ref'), '23514', 'project-ref whitespace is rejected');
select is(pg_temp.expect_installation_check('project-long', project_ref => repeat('a', 65)), '23514', 'overlong project ref is rejected');
select is(pg_temp.expect_installation_check('project-duplicate', project_ref => 'abcdefghijklmnopqrst'), '23505', 'duplicate project ref is rejected');
select is(pg_temp.expect_installation_check('project-archived-duplicate', project_ref => 'archivedprojectref'), '23505', 'archived project ref cannot be reused');

select is(pg_temp.expect_installation_check('region-upper', region => 'EU-NORTH-1'), '23514', 'uppercase region is rejected');
select is(pg_temp.expect_installation_check('region-space', region => 'eu north 1'), '23514', 'region whitespace is rejected');
select is(pg_temp.expect_installation_check('region-symbol', region => 'eu_north_1'), '23514', 'invalid region characters are rejected');
select is(pg_temp.expect_installation_check('region-long', region => repeat('a', 65)), '23514', 'overlong region is rejected');

select is(pg_temp.expect_installation_check('note-empty', note => ''), '23514', 'empty note is rejected');
select is(pg_temp.expect_installation_check('note-leading', note => ' note'), '23514', 'leading note whitespace is rejected');
select is(pg_temp.expect_installation_check('note-trailing', note => 'note '), '23514', 'trailing note whitespace is rejected');
select is(pg_temp.expect_installation_check('note-long', note => repeat('n', 1001)), '23514', 'overlong note is rejected');
select is(pg_temp.expect_installation_check('revision-zero', rev => 0), '23514', 'zero revision is rejected');
select is(pg_temp.expect_installation_check('revision-negative', rev => -1), '23514', 'negative revision is rejected');
select is(
  pg_temp.expect_installation_check(
    'time-invalid',
    created_time => current_timestamp,
    updated_time => current_timestamp - interval '1 second'
  ),
  '23514',
  'updated_at before created_at is rejected'
);
select is(
  pg_temp.expect_installation_check('archive-time-only', archived_time => current_timestamp),
  '23514',
  'archived_at without archived_by is rejected'
);
select is(
  pg_temp.expect_installation_check(
    'archive-actor-only',
    archived_actor => '10000000-0000-4000-8000-000000000099'
  ),
  '23514',
  'archived_by without archived_at is rejected'
);

select throws_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, created_by, updated_by)
    values (
      '10000000-0000-4000-8000-000000000404', 'unknown-tenant',
      'Unknown Tenant', 'production',
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000099'
    )$$,
  '23503',
  null,
  'a missing tenant is rejected'
);
select throws_ok(
  $$delete from public.tenants where id = '10000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'tenant delete is restricted while installations exist'
);
select lives_ok(
  $$delete from public.tenants where id = '10000000-0000-4000-8000-000000000002'$$,
  'a tenant without installations may be deleted structurally'
);

select index_is_unique(
  'public', 'installations', 'idx_installations_installation_code_unique',
  'installation code has a global unique index'
);
select index_is_unique(
  'public', 'installations', 'idx_installations_supabase_project_ref_unique',
  'project ref has a partial unique index'
);
select has_index(
  'public', 'installations', 'idx_installations_tenant_id', array['tenant_id'],
  'tenant relation is indexed'
);
select has_index(
  'public', 'installations', 'idx_installations_active_display_name',
  array['display_name', 'id'], 'active global list has stable index'
);
select has_index(
  'public', 'installations', 'idx_installations_tenant_active_display_name',
  array['tenant_id', 'display_name', 'id'], 'active tenant list has stable index'
);
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.idx_installations_supabase_project_ref_unique'::regclass),
  '(supabase_project_ref IS NOT NULL)',
  'project-ref uniqueness excludes null only'
);
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.idx_installations_active_display_name'::regclass),
  '(archived_at IS NULL)',
  'global list index excludes archived rows'
);
select is(
  (select pg_get_expr(indpred, indrelid) from pg_index
   where indexrelid = 'public.idx_installations_tenant_active_display_name'::regclass),
  '(archived_at IS NULL)',
  'tenant list index excludes archived rows'
);

select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
   cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege_name)
   where has_table_privilege(role_name, 'public.installations', privilege_name)),
  1,
  'only the separately reviewed authenticated SELECT grant exists'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'installations'),
  1,
  'the separately reviewed F2C2 step adds exactly one installation policy'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.installations'::regclass),
  true,
  'installation RLS is enabled by its separately reviewed step'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.installations'::regclass),
  true,
  'installation FORCE RLS is enabled by its separately reviewed step'
);

set local role anon;
select throws_ok('select * from public.installations', '42501', null, 'anon cannot select installations');
select throws_ok(
  $$insert into public.installations
    (tenant_id, installation_code, display_name, environment, created_by, updated_by)
    values (
      '10000000-0000-4000-8000-000000000001', 'anon-write',
      'Anon Write', 'production',
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000099'
    )$$,
  '42501',
  null,
  'anon cannot insert installations'
);
reset role;

select * from finish();

rollback;
