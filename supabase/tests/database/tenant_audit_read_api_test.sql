begin;

select no_plan();

select has_function(
  'public',
  'list_tenant_audit_events',
  array['uuid', 'integer', 'timestamp with time zone', 'uuid'],
  'the audit read function has the expected typed signature'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'list_tenant_audit_events'
  ),
  1,
  'the audit read function has no overloads'
);
select is(
  (
    select pg_get_function_result(
      'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure
    )
  ),
  'TABLE(id uuid, tenant_id uuid, event_type text, actor_user_id uuid, occurred_at timestamp with time zone, revision_before bigint, revision_after bigint, changed_fields text[], correlation_id uuid, has_more boolean, next_cursor_occurred_at timestamp with time zone, next_cursor_id uuid)',
  'the audit read return table exposes exactly audit metadata and pagination state'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where oid =
      'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure
      and prosecdef
      and provolatile = 's'
      and proparallel = 'u'
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=pg_catalog']::text[]
  ),
  1,
  'the audit read function is stable security definer with locked execution properties'
);
select ok(
  obj_description(
    'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)'::regprocedure,
    'pg_proc'
  ) is not null,
  'the audit read function has a comment'
);
select ok(
  not has_function_privilege(
    'public',
    'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the audit read function'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the audit read function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'authenticated can execute the audit read function'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.list_tenant_audit_events(uuid,integer,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'service_role cannot execute the audit read function'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenant_audit_events'
  ),
  0,
  'audit still has no RLS policies'
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
    where has_table_privilege(
      denied.role_name,
      'public.tenant_audit_events',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
  ),
  0,
  'all API roles still lack direct audit table privileges'
);
select is(
  (
    select pg_get_indexdef(indexrelid)
    from pg_index
    where indexrelid =
      'public.idx_tenant_audit_events_tenant_occurred'::regclass
  ),
  'CREATE INDEX idx_tenant_audit_events_tenant_occurred ON public.tenant_audit_events USING btree (tenant_id, occurred_at DESC, id DESC)',
  'the existing E3 index matches tenant-scoped newest-first pagination'
);

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000051'),
  ('00000000-0000-4000-8000-000000000052');

insert into public.tenants (
  id, category, legal_name, created_by, updated_by
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    'internal',
    'Audit page tenant',
    '00000000-0000-4000-8000-000000000051',
    '00000000-0000-4000-8000-000000000051'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    'internal',
    'Other audit tenant',
    '00000000-0000-4000-8000-000000000051',
    '00000000-0000-4000-8000-000000000051'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    'internal',
    'Empty audit tenant',
    '00000000-0000-4000-8000-000000000051',
    '00000000-0000-4000-8000-000000000051'
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    'internal',
    'Archived audit tenant',
    '00000000-0000-4000-8000-000000000051',
    '00000000-0000-4000-8000-000000000051'
  );

update public.tenants
set
  archived_at = '2026-01-02 00:00:00+00',
  archived_by = '00000000-0000-4000-8000-000000000051'
where id = '80000000-0000-4000-8000-000000000004';

insert into public.tenant_audit_events (
  id,
  tenant_id,
  event_type,
  actor_user_id,
  occurred_at,
  revision_before,
  revision_after,
  changed_fields
)
select
  (
    '90000000-0000-4000-8000-' ||
    lpad(series.revision::text, 12, '0')
  )::uuid,
  '80000000-0000-4000-8000-000000000001',
  case when series.revision = 1 then 'tenant_created' else 'tenant_edited' end,
  '00000000-0000-4000-8000-000000000051',
  case
    when series.revision in (30, 31)
      then '2026-01-01 00:00:31+00'::timestamp with time zone
    else
      '2026-01-01 00:00:00+00'::timestamp with time zone
      + make_interval(secs => series.revision)
  end,
  case when series.revision = 1 then null else series.revision - 1 end,
  series.revision,
  case
    when series.revision = 1
      then array['category', 'id', 'legal_name', 'revision']
    else array['legal_name']
  end
from generate_series(1, 55) as series(revision);

insert into public.tenant_audit_events (
  id,
  tenant_id,
  event_type,
  actor_user_id,
  occurred_at,
  revision_before,
  revision_after,
  changed_fields
)
values
  (
    '91000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002',
    'tenant_created',
    '00000000-0000-4000-8000-000000000051',
    '2026-01-03 00:00:00+00',
    null,
    1,
    array['category', 'id', 'legal_name', 'revision']
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '80000000-0000-4000-8000-000000000002',
    'tenant_edited',
    '00000000-0000-4000-8000-000000000051',
    '2026-01-03 00:00:01+00',
    1,
    2,
    array['legal_name']
  ),
  (
    '92000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000004',
    'tenant_created',
    '00000000-0000-4000-8000-000000000051',
    '2026-01-02 00:00:00+00',
    null,
    1,
    array['category', 'id', 'legal_name', 'revision']
  );

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000051',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'unauthorized',
  'audit read fails closed while the owner singleton is missing'
);
reset role;

insert into public.control_center_owner (owner_user_id)
values ('00000000-0000-4000-8000-000000000051');

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000052',
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'unauthorized',
  'a non-owner receives only unauthorized'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'P0001',
  'unauthorized',
  'null auth uid receives only unauthorized'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000051',
  true
);
set local role authenticated;
select lives_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001'
  )$$,
  'the valid owner can read tenant audit through the function'
);
reset role;

select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001'
    )
  ),
  50,
  'the default page size is fifty'
);
select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      100
    )
  ),
  55,
  'an explicit page size up to one hundred is accepted'
);
select is(
  (
    select count(distinct tenant_id)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      100
    )
    where tenant_id = '80000000-0000-4000-8000-000000000001'
  ),
  1,
  'only the requested tenant scope is returned'
);
select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      100
    )
    where tenant_id <> '80000000-0000-4000-8000-000000000001'
  ),
  0,
  'another tenant audit cannot leak into the result'
);
select is(
  (
    select array_agg(revision_after order by occurred_at desc, id desc)
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      2
    )
  ),
  array[55, 54]::bigint[],
  'the first explicit page is newest first'
);
select is(
  (
    select array_agg(id order by occurred_at desc, id desc)
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      100
    )
    where occurred_at = '2026-01-01 00:00:31+00'
  ),
  array[
    '90000000-0000-4000-8000-000000000031',
    '90000000-0000-4000-8000-000000000030'
  ]::uuid[],
  'equal timestamps use descending id as deterministic tie-break'
);

create temporary table e5_first_page_cursor on commit drop as
select distinct
  has_more,
  next_cursor_occurred_at,
  next_cursor_id
from public.list_tenant_audit_events(
  '80000000-0000-4000-8000-000000000001'
);

select is(
  (select has_more from e5_first_page_cursor),
  true,
  'the first default page reports that another page exists'
);
select is(
  (select next_cursor_id from e5_first_page_cursor),
  '90000000-0000-4000-8000-000000000006'::uuid,
  'the first page cursor points at its last returned event'
);
select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      50,
      (select next_cursor_occurred_at from e5_first_page_cursor),
      (select next_cursor_id from e5_first_page_cursor)
    )
  ),
  5,
  'the continuation cursor returns the final five events'
);
select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000001',
      50,
      (select next_cursor_occurred_at from e5_first_page_cursor),
      (select next_cursor_id from e5_first_page_cursor)
    )
    where has_more
      or next_cursor_occurred_at is not null
      or next_cursor_id is not null
  ),
  0,
  'the final page has null next cursor and no more flag'
);
select is(
  (
    with first_page as (
      select id
      from public.list_tenant_audit_events(
        '80000000-0000-4000-8000-000000000001'
      )
    ),
    second_page as (
      select id
      from public.list_tenant_audit_events(
        '80000000-0000-4000-8000-000000000001',
        50,
        (select next_cursor_occurred_at from e5_first_page_cursor),
        (select next_cursor_id from e5_first_page_cursor)
      )
    )
    select count(*)::integer
    from (
      select id from first_page
      union
      select id from second_page
    ) as all_pages
  ),
  55,
  'the two pages contain every event without gaps'
);
select is(
  (
    with first_page as (
      select id
      from public.list_tenant_audit_events(
        '80000000-0000-4000-8000-000000000001'
      )
    ),
    second_page as (
      select id
      from public.list_tenant_audit_events(
        '80000000-0000-4000-8000-000000000001',
        50,
        (select next_cursor_occurred_at from e5_first_page_cursor),
        (select next_cursor_id from e5_first_page_cursor)
      )
    )
    select count(*)::integer
    from first_page
    join second_page using (id)
  ),
  0,
  'the two pages have no duplicate event'
);

select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000003'
    )
  ),
  0,
  'an existing tenant without events returns an empty set'
);
select is(
  (
    select count(*)::integer
    from public.list_tenant_audit_events(
      '80000000-0000-4000-8000-000000000004'
    )
  ),
  1,
  'an archived tenant audit remains readable'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000099'
  )$$,
  'P0001',
  'not_found',
  'an unknown tenant returns the stable not_found error'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(null)$$,
  '22023',
  'validation_error',
  'null tenant id is rejected'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001', 0
  )$$,
  '22023',
  'validation_error',
  'page size zero is rejected'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001', -1
  )$$,
  '22023',
  'validation_error',
  'negative page size is rejected'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001', 101
  )$$,
  '22023',
  'validation_error',
  'page size above one hundred is rejected'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001',
    50,
    '2026-01-01 00:00:01+00',
    null
  )$$,
  '22023',
  'validation_error',
  'a partial cursor is rejected'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001',
    50,
    '2026-01-03 00:00:01+00',
    '91000000-0000-4000-8000-000000000002'
  )$$,
  '22023',
  'validation_error',
  'a cursor from another tenant cannot cross tenant scope'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001',
    50,
    '2026-01-01 00:00:01+00',
    '90000000-0000-4000-8000-000000000099'
  )$$,
  '22023',
  'validation_error',
  'an unknown cursor is rejected'
);

set local role authenticated;
select throws_ok(
  'select * from public.tenant_audit_events',
  '42501',
  null,
  'authenticated still cannot select audit directly'
);
select throws_ok(
  'update public.tenant_audit_events set changed_fields = changed_fields',
  '42501',
  null,
  'authenticated still cannot update audit directly'
);
reset role;

set local role anon;
select throws_ok(
  'select * from public.tenant_audit_events',
  '42501',
  null,
  'anon still cannot select audit directly'
);
select throws_ok(
  $$select * from public.list_tenant_audit_events(
    '80000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'anon cannot execute the audit read function'
);
reset role;

select * from finish();

rollback;
