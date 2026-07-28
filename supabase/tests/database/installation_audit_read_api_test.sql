begin;

select no_plan();

select has_function(
  'public',
  'list_installation_audit_events',
  array['uuid', 'integer', 'timestamp with time zone', 'uuid'],
  'installation audit read has the locked typed signature'
);
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'list_installation_audit_events'),
  1,
  'installation audit read has no overloads'
);
select is(
  pg_get_function_result(
    'public.list_installation_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure
  ),
  'TABLE(id uuid, installation_id uuid, event_type text, actor_user_id uuid, occurred_at timestamp with time zone, revision_before bigint, revision_after bigint, changed_fields text[], correlation_id uuid, has_more boolean, next_cursor_occurred_at timestamp with time zone, next_cursor_id uuid)',
  'output is exactly audit metadata and pagination state'
);
select is(
  (select count(*)::integer from pg_proc
   where oid = 'public.list_installation_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure
     and prosecdef
     and provolatile = 's'
     and proparallel = 'u'
     and proowner = 'postgres'::regrole
     and proconfig = array['search_path=pg_catalog']::text[]),
  1,
  'audit read is stable security definer with locked metadata'
);
select ok(
  obj_description(
    'public.list_installation_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure,
    'pg_proc'
  ) is not null,
  'audit read is documented'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('service_role')) denied(role_name)
   where has_function_privilege(
     role_name,
     'public.list_installation_audit_events(uuid,integer,timestamp with time zone,uuid)',
     'EXECUTE'
   )),
  0,
  'PUBLIC, anon, and service_role cannot execute audit read'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_installation_audit_events(uuid,integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'authenticated can execute the owner-guarded audit read'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'installation_audit_events'),
  0,
  'audit table still has no policy'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('authenticated'), ('service_role')) denied(role_name)
   where has_table_privilege(
     role_name,
     'public.installation_audit_events',
     'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
   )),
  0,
  'all API roles still have zero direct audit privileges'
);
select is(
  (select pg_get_indexdef(indexrelid) from pg_index
   where indexrelid = 'public.idx_installation_audit_events_installation_occurred'::regclass),
  'CREATE INDEX idx_installation_audit_events_installation_occurred ON public.installation_audit_events USING btree (installation_id, occurred_at DESC, id DESC)',
  'existing index matches the cursor query'
);

insert into auth.users (id)
values
  ('50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002');

insert into public.tenants
  (id, category, legal_name, created_by, updated_by)
values (
  '50000000-0000-4000-8000-000000000011',
  'internal',
  'Installation Audit Read Tenant',
  '50000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001'
);

insert into public.installations
  (id, tenant_id, installation_code, display_name, environment, created_by, updated_by)
values
  (
    '50000000-0000-4000-8000-000000000021',
    '50000000-0000-4000-8000-000000000011',
    'audit-read-primary', 'Audit Read Primary', 'production',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ),
  (
    '50000000-0000-4000-8000-000000000022',
    '50000000-0000-4000-8000-000000000011',
    'audit-read-other', 'Audit Read Other', 'staging',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  ),
  (
    '50000000-0000-4000-8000-000000000023',
    '50000000-0000-4000-8000-000000000011',
    'audit-read-empty', 'Audit Read Empty', 'test',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001'
  );

insert into public.installation_audit_events (
  id, installation_id, event_type, actor_user_id, occurred_at,
  revision_before, revision_after, changed_fields
)
select
  (
    '51000000-0000-4000-8000-' ||
    lpad(series.revision::text, 12, '0')
  )::uuid,
  '50000000-0000-4000-8000-000000000021',
  case when series.revision = 1
    then 'installation_created'
    else 'installation_edited'
  end,
  '50000000-0000-4000-8000-000000000001',
  case when series.revision in (20, 21)
    then '2026-07-28 12:00:21+00'::timestamp with time zone
    else '2026-07-28 12:00:00+00'::timestamp with time zone
      + make_interval(secs => series.revision)
  end,
  case when series.revision = 1 then null else series.revision - 1 end,
  series.revision,
  case when series.revision = 1
    then array['id', 'tenant_id', 'installation_code', 'display_name',
      'environment', 'administrative_status', 'revision', 'created_at',
      'created_by', 'updated_at', 'updated_by']
    else array['display_name', 'revision', 'updated_at', 'updated_by']
  end
from generate_series(1, 30) as series(revision);

insert into public.installation_audit_events (
  id, installation_id, event_type, actor_user_id, occurred_at,
  revision_before, revision_after, changed_fields
) values (
  '52000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000022',
  'installation_created',
  '50000000-0000-4000-8000-000000000001',
  '2026-07-28 13:00:00+00',
  null, 1,
  array['id', 'tenant_id', 'installation_code', 'display_name',
    'environment', 'administrative_status', 'revision', 'created_at',
    'created_by', 'updated_at', 'updated_by']
);

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021'
  )$$,
  'P0001', 'unauthorized', 'missing singleton fails closed'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('50000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021'
  )$$,
  'P0001', 'unauthorized', 'authenticated non-owner is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021'
  )$$,
  'P0001', 'unauthorized', 'null auth is rejected'
);
reset role;

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021'
  )$$,
  'verified owner can read installation audit'
);
reset role;

select is(
  (select count(*)::integer
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021'
   )),
  25,
  'default page size is twenty-five'
);
select is(
  (select count(*)::integer
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021', 100
   )),
  30,
  'explicit page size up to one hundred is respected'
);
select is(
  (select count(*)::integer
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021', 100
   )
   where installation_id <> '50000000-0000-4000-8000-000000000021'),
  0,
  'another installation never leaks into the result'
);
select is(
  (select array_agg(revision_after order by occurred_at desc, id desc)
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021', 3
   )),
  array[30, 29, 28]::bigint[],
  'events are newest first'
);
select is(
  (select array_agg(id order by occurred_at desc, id desc)
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021', 100
   )
   where occurred_at = '2026-07-28 12:00:21+00'),
  array[
    '51000000-0000-4000-8000-000000000021',
    '51000000-0000-4000-8000-000000000020'
  ]::uuid[],
  'equal timestamps use descending ID'
);

create temporary table installation_audit_cursor on commit drop as
select distinct has_more, next_cursor_occurred_at, next_cursor_id
from public.list_installation_audit_events(
  '50000000-0000-4000-8000-000000000021'
);

select ok(
  (select has_more from installation_audit_cursor),
  'first default page reports another page'
);
select is(
  (select next_cursor_id from installation_audit_cursor),
  '51000000-0000-4000-8000-000000000006'::uuid,
  'cursor identifies the last event on page one'
);
select is(
  (select count(*)::integer
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021',
     25,
     (select next_cursor_occurred_at from installation_audit_cursor),
     (select next_cursor_id from installation_audit_cursor)
   )),
  5,
  'cursor returns the remaining five events'
);
select is(
  (with first_page as (
     select id from public.list_installation_audit_events(
       '50000000-0000-4000-8000-000000000021'
     )
   ), second_page as (
     select id from public.list_installation_audit_events(
       '50000000-0000-4000-8000-000000000021',
       25,
       (select next_cursor_occurred_at from installation_audit_cursor),
       (select next_cursor_id from installation_audit_cursor)
     )
   )
   select count(*)::integer from first_page join second_page using (id)),
  0,
  'pages contain no duplicate event'
);
select is(
  (select count(*)::integer
   from public.list_installation_audit_events(
     '50000000-0000-4000-8000-000000000021',
     25,
     (select next_cursor_occurred_at from installation_audit_cursor),
     (select next_cursor_id from installation_audit_cursor)
   )
   where has_more
      or next_cursor_occurred_at is not null
      or next_cursor_id is not null),
  0,
  'final page has no continuation cursor'
);
select is(
  (select count(*)::integer from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000023'
  )),
  0,
  'existing installation without audit returns an empty set'
);

select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000099'
  )$$,
  'P0001', 'not_found', 'unknown installation returns not_found'
);
select throws_ok(
  $$select * from public.list_installation_audit_events(null)$$,
  '22023', 'validation_error', 'null installation ID is rejected'
);
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021', 0
  )$$,
  '22023', 'validation_error', 'zero page size is rejected'
);
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021', 101
  )$$,
  '22023', 'validation_error', 'page size above one hundred is rejected'
);
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021',
    25, '2026-07-28 12:00:01+00', null
  )$$,
  '22023', 'validation_error', 'partial cursor is rejected'
);
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021',
    25, '2026-07-28 13:00:00+00',
    '52000000-0000-4000-8000-000000000001'
  )$$,
  '22023', 'validation_error', 'cursor from another installation is rejected'
);

set local role authenticated;
select throws_ok(
  'select * from public.installation_audit_events',
  '42501', null, 'authenticated still cannot read audit directly'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from public.list_installation_audit_events(
    '50000000-0000-4000-8000-000000000021'
  )$$,
  '42501', null, 'anon cannot execute audit read'
);
reset role;

select * from finish();

rollback;
