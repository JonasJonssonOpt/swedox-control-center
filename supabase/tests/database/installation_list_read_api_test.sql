begin;

select no_plan();

select has_function(
  'public',
  'list_installations',
  array['integer', 'text', 'uuid', 'uuid', 'text', 'text', 'boolean', 'text'],
  'installation list has the locked signature'
);
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'list_installations'),
  1,
  'installation list has no overloads'
);
select is(
  pg_get_function_result(
    'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure
  ),
  'TABLE(id uuid, tenant_id uuid, tenant_legal_name text, installation_code text, display_name text, environment text, administrative_status text, hosting_region text, application_host text, revision bigint, updated_at timestamp with time zone, archived_at timestamp with time zone, has_more boolean, next_cursor_display_name text, next_cursor_id uuid)',
  'return type contains only list-safe metadata and pagination state'
);
select is(
  (select count(*)::integer from pg_proc
   where oid = 'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure
     and prosecdef
     and provolatile = 's'
     and proparallel = 'u'
     and proowner = 'postgres'::regrole
     and proconfig = array['search_path=pg_catalog']::text[]),
  1,
  'installation list has locked execution metadata'
);
select is(
  (select pronargdefaults::integer from pg_proc
   where oid = 'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure),
  8,
  'all list arguments have defaults'
);
select ok(
  obj_description(
    'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure,
    'pg_proc'
  ) is not null,
  'installation list is documented'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('service_role')) denied(role_name)
   where has_function_privilege(
     role_name,
     'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)',
     'EXECUTE'
   )),
  0,
  'PUBLIC, anon, and service_role lack execute'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)',
    'EXECUTE'
  ),
  'authenticated can execute the owner-guarded list'
);

select is(
  (select pg_get_indexdef(indexrelid) from pg_index
   where indexrelid = 'public.idx_installations_active_display_name'::regclass),
  'CREATE INDEX idx_installations_active_display_name ON public.installations USING btree (display_name, id) WHERE (archived_at IS NULL)',
  'default list index matches stable ordering'
);
select is(
  (select pg_get_indexdef(indexrelid) from pg_index
   where indexrelid = 'public.idx_installations_tenant_active_display_name'::regclass),
  'CREATE INDEX idx_installations_tenant_active_display_name ON public.installations USING btree (tenant_id, display_name, id) WHERE (archived_at IS NULL)',
  'tenant list index matches stable ordering'
);

insert into auth.users (id)
values
  ('60000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002');

insert into public.tenants (
  id, category, legal_name, archived_at, archived_by, created_by, updated_by
) values
  (
    '60000000-0000-4000-8000-000000000011',
    'internal', 'List Tenant Alpha', null, null,
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  ),
  (
    '60000000-0000-4000-8000-000000000012',
    'internal', 'List Tenant Archived', current_timestamp,
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001'
  );

insert into public.installations (
  id, tenant_id, installation_code, display_name, environment,
  administrative_status, application_url, supabase_project_ref,
  hosting_region, administrative_note, archived_at, archived_by,
  created_by, updated_by
)
select
  (
    '61000000-0000-4000-8000-' ||
    lpad(series.number::text, 12, '0')
  )::uuid,
  case when series.number = 55
    then '60000000-0000-4000-8000-000000000012'::uuid
    else '60000000-0000-4000-8000-000000000011'::uuid
  end,
  'list-item-' || lpad(series.number::text, 2, '0'),
  case when series.number in (30, 31)
    then 'Same Name'
    else 'Item ' || lpad(series.number::text, 2, '0')
  end,
  (array['production', 'staging', 'test', 'development'])[
    ((series.number - 1) % 4) + 1
  ],
  (array['planned', 'active', 'paused', 'decommissioned'])[
    ((series.number - 1) % 4) + 1
  ],
  case when series.number = 1
    then 'https://App.Example.Invalid:8443/path?query=1'
    else null
  end,
  case when series.number = 2 then 'protectedprojectref' else null end,
  case when series.number = 1 then 'eu-north-1' else null end,
  case when series.number = 2 then 'Confidential search sentinel' else null end,
  case when series.number in (54, 55) then current_timestamp else null end,
  case when series.number in (54, 55)
    then '60000000-0000-4000-8000-000000000001'::uuid
    else null
  end,
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001'
from generate_series(1, 55) as series(number);

insert into public.installations (
  id, tenant_id, installation_code, display_name, environment,
  administrative_status, created_by, updated_by
) values (
  '61000000-0000-4000-8000-000000000099',
  '60000000-0000-4000-8000-000000000011',
  'literal-percent-underscore',
  'Literal %_ Search',
  'production',
  'planned',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001'
);

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  'select * from public.list_installations()',
  'P0001', 'unauthorized', 'missing singleton fails closed'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('60000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  'select * from public.list_installations()',
  'P0001', 'unauthorized', 'non-owner is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  'select * from public.list_installations()',
  'P0001', 'unauthorized', 'null auth is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok('select * from public.list_installations()', 'owner can read list');
reset role;

select is(
  (select count(*)::integer from public.list_installations()),
  50,
  'default page size is fifty'
);
select is(
  (select count(*)::integer from public.list_installations(1)),
  1,
  'explicit page size one is respected'
);
select is(
  (select count(*)::integer from public.list_installations(100)),
  54,
  'page size one hundred returns all nonarchived rows'
);
select is(
  (select count(*)::integer from public.list_installations(null)),
  50,
  'explicit null page size uses default'
);
select throws_ok(
  'select * from public.list_installations(0)',
  '22023', 'validation_error', 'zero page size is rejected'
);
select throws_ok(
  'select * from public.list_installations(-1)',
  '22023', 'validation_error', 'negative page size is rejected'
);
select throws_ok(
  'select * from public.list_installations(101)',
  '22023', 'validation_error', 'page size above one hundred is rejected'
);

select is(
  (select tenant_legal_name from public.list_installations(100)
   where installation_code = 'list-item-01'),
  'List Tenant Alpha',
  'tenant legal name is joined'
);
select is(
  (select application_host from public.list_installations(100)
   where installation_code = 'list-item-01'),
  'app.example.invalid',
  'application host excludes scheme, port, path, and query'
);
select is(
  (select application_host from public.list_installations(100)
   where installation_code = 'list-item-03'),
  null,
  'missing URL produces null host'
);
select is(
  (select array_agg(id order by display_name, id)
   from public.list_installations(100)
   where display_name = 'Same Name'),
  array[
    '61000000-0000-4000-8000-000000000030',
    '61000000-0000-4000-8000-000000000031'
  ]::uuid[],
  'same display name uses ascending UUID tie-break'
);

create temporary table installation_list_cursor on commit drop as
select distinct has_more, next_cursor_display_name, next_cursor_id
from public.list_installations();

select ok(
  (select has_more from installation_list_cursor),
  'first default page reports another page'
);
select is(
  (select count(*)::integer
   from public.list_installations(
     50,
     (select next_cursor_display_name from installation_list_cursor),
     (select next_cursor_id from installation_list_cursor)
   )),
  4,
  'next cursor returns remaining nonarchived rows'
);
select is(
  (with first_page as (
     select id from public.list_installations()
   ), second_page as (
     select id from public.list_installations(
       50,
       (select next_cursor_display_name from installation_list_cursor),
       (select next_cursor_id from installation_list_cursor)
     )
   )
   select count(*)::integer from first_page join second_page using (id)),
  0,
  'pages have no duplicates'
);
select is(
  (with first_page as (
     select id from public.list_installations()
   ), second_page as (
     select id from public.list_installations(
       50,
       (select next_cursor_display_name from installation_list_cursor),
       (select next_cursor_id from installation_list_cursor)
     )
   )
   select count(*)::integer from (
     select id from first_page union select id from second_page
   ) all_rows),
  54,
  'pages have no gaps'
);
select is(
  (select count(*)::integer
   from public.list_installations(
     50,
     (select next_cursor_display_name from installation_list_cursor),
     (select next_cursor_id from installation_list_cursor)
   )
   where has_more or next_cursor_display_name is not null or next_cursor_id is not null),
  0,
  'last page has null cursor'
);
select throws_ok(
  $$select * from public.list_installations(
    50, 'Item 01', null
  )$$,
  '22023', 'validation_error', 'partial cursor is rejected'
);
select throws_ok(
  $$select * from public.list_installations(
    50, 'Unknown', '61000000-0000-4000-8000-000000000404'
  )$$,
  '22023', 'validation_error', 'unknown cursor is rejected'
);
select throws_ok(
  $$select * from public.list_installations(
    50, 'Item 01', '61000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000012'
  )$$,
  '22023', 'validation_error', 'cursor outside tenant filter is rejected'
);

select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, '60000000-0000-4000-8000-000000000012',
    null, null, true
  )),
  1,
  'tenant filter returns archived tenant installation'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, '60000000-0000-4000-8000-000000000099'
  )),
  0,
  'unknown tenant filter returns empty result'
);
select is(
  (select count(distinct environment)::integer
   from public.list_installations(100, null, null, null, 'production')),
  1,
  'production filter is applied'
);
select is(
  (select count(distinct environment)::integer
   from public.list_installations(100, null, null, null, 'staging')),
  1,
  'staging filter is applied'
);
select is(
  (select count(distinct environment)::integer
   from public.list_installations(100, null, null, null, 'test')),
  1,
  'test filter is applied'
);
select is(
  (select count(distinct environment)::integer
   from public.list_installations(100, null, null, null, 'development')),
  1,
  'development filter is applied'
);
select throws_ok(
  $$select * from public.list_installations(
    50, null, null, null, 'preview'
  )$$,
  '22023', 'validation_error', 'invalid environment is rejected'
);
select is(
  (select count(distinct administrative_status)::integer
   from public.list_installations(100, null, null, null, null, 'planned')),
  1,
  'planned filter is applied'
);
select is(
  (select count(distinct administrative_status)::integer
   from public.list_installations(100, null, null, null, null, 'active')),
  1,
  'active filter is applied'
);
select is(
  (select count(distinct administrative_status)::integer
   from public.list_installations(100, null, null, null, null, 'paused')),
  1,
  'paused filter is applied'
);
select is(
  (select count(distinct administrative_status)::integer
   from public.list_installations(100, null, null, null, null, 'decommissioned')),
  1,
  'decommissioned filter is applied'
);
select throws_ok(
  $$select * from public.list_installations(
    50, null, null, null, null, 'provisioning'
  )$$,
  '22023', 'validation_error', 'invalid status is rejected'
);

select is(
  (select count(*)::integer from public.list_installations(100)),
  54,
  'archived rows are excluded by default'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, true
  )),
  56,
  'include archived returns active and archived rows'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'item 01'
  )),
  1,
  'display-name search is case-insensitive'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'Item 01'
  )),
  1,
  'display-name search matches the allowed field'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, ' LIST-ITEM-03 '
  )),
  1,
  'installation-code search is trimmed and case-insensitive'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'list-item-03'
  )),
  1,
  'installation-code search matches the allowed field'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, '   '
  )),
  54,
  'whitespace-only search normalizes to no search'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, '%'
  )),
  1,
  'percent is a literal search character'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, '_'
  )),
  1,
  'underscore is a literal search character'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'List Tenant Alpha'
  )),
  0,
  'search does not inspect tenant legal name'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'app.example.invalid'
  )),
  0,
  'search does not inspect application host'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'path?query=1'
  )),
  0,
  'search does not inspect full application URL'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'protectedprojectref'
  )),
  0,
  'search does not inspect project ref'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'Confidential search sentinel'
  )),
  0,
  'search does not inspect administrative note'
);
select is(
  (select count(*)::integer from public.list_installations(
    100, null, null, null, null, null, false, 'eu-north-1'
  )),
  0,
  'search does not inspect hosting region'
);
select throws_ok(
  $$select * from public.list_installations(
    50, null, null, null, null, null, false, repeat('x', 121)
  )$$,
  '22023', 'validation_error', 'overlong search is rejected'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'installations'
     and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'no write policy was added'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('service_role')) denied(role_name)
   where has_table_privilege(
     role_name, 'public.installations',
     'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
   )),
  0,
  'non-authenticated API roles retain zero installation privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.installations', 'INSERT, UPDATE, DELETE'),
  'authenticated direct writes remain blocked'
);

set local role anon;
select throws_ok(
  'select * from public.list_installations()',
  '42501', null, 'anon cannot execute list RPC'
);
reset role;

select * from finish();

rollback;
