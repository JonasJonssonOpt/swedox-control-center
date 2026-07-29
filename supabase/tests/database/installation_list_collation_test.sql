begin;

select no_plan();

select ok(
  position(
    'display_name collate "c"'
    in lower(pg_get_functiondef(
      'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure
    ))
  ) > 0,
  'list function uses explicit C collation'
);
select ok(
  position(
    'order by installation.display_name asc'
    in lower(pg_get_functiondef(
      'public.list_installations(integer,text,uuid,uuid,text,text,boolean,text)'::regprocedure
    ))
  ) = 0,
  'list function has no implicit display-name ordering'
);
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'installations'
      and indexdef like '%COLLATE "C"%'
  ),
  0,
  'collation fix creates no speculative index'
);

insert into auth.users (id)
values
  ('68000000-0000-4000-8000-000000000001'),
  ('68000000-0000-4000-8000-000000000002');

insert into public.tenants (
  id, category, legal_name, created_by, updated_by
) values (
  '68000000-0000-4000-8000-000000000011',
  'internal',
  'Collation Tenant',
  '68000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000001'
);

insert into public.installations (
  id, tenant_id, installation_code, display_name, environment,
  administrative_status, created_by, updated_by
) values
  (
    '68100000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000011',
    'alpha-title', 'Alpha', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000002',
    '68000000-0000-4000-8000-000000000011',
    'alpha-lower', 'alpha', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000003',
    '68000000-0000-4000-8000-000000000011',
    'alpha-upper', 'ALPHA', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000004',
    '68000000-0000-4000-8000-000000000011',
    'control-center-test-2', 'Control center test 2', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000005',
    '68000000-0000-4000-8000-000000000011',
    'control-center-production', 'Control Center Test Production',
    'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000006',
    '68000000-0000-4000-8000-000000000011',
    'same-name-1', 'Same Name', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000007',
    '68000000-0000-4000-8000-000000000011',
    'same-name-2', 'Same Name', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000008',
    '68000000-0000-4000-8000-000000000011',
    'a-dash-1', 'A-1', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000009',
    '68000000-0000-4000-8000-000000000011',
    'a-number-2', 'A2', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000010',
    '68000000-0000-4000-8000-000000000011',
    'swedish-a-diaeresis', 'Älg', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000011',
    '68000000-0000-4000-8000-000000000011',
    'swedish-a-ring', 'Ångström', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  ),
  (
    '68100000-0000-4000-8000-000000000012',
    '68000000-0000-4000-8000-000000000011',
    'swedish-o-diaeresis', 'Örebro', 'production', 'planned',
    '68000000-0000-4000-8000-000000000001',
    '68000000-0000-4000-8000-000000000001'
  );

insert into public.control_center_owner (owner_user_id)
values ('68000000-0000-4000-8000-000000000001');

select set_config(
  'request.jwt.claim.sub',
  '68000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  (
    select array_agg(display_name)
    from public.list_installations(100)
  ),
  array[
    'A-1',
    'A2',
    'ALPHA',
    'Alpha',
    'Control Center Test Production',
    'Control center test 2',
    'Same Name',
    'Same Name',
    'alpha',
    'Älg',
    'Ångström',
    'Örebro'
  ]::text[],
  'mixed case, punctuation, digits, and Swedish names follow C collation'
);
select is(
  (
    select array_agg(id)
    from public.list_installations(100)
    where display_name = 'Same Name'
  ),
  array[
    '68100000-0000-4000-8000-000000000006',
    '68100000-0000-4000-8000-000000000007'
  ]::uuid[],
  'equal names use ascending UUID tie-break'
);
select is(
  (
    select count(*)::integer
    from public.list_installations(100)
    where application_host is not null or hosting_region is not null
  ),
  0,
  'nullable technical metadata remains null'
);

create temporary table collation_first_page on commit drop as
select * from public.list_installations(5);

select is(
  (select array_agg(display_name) from collation_first_page),
  array[
    'A-1',
    'A2',
    'ALPHA',
    'Alpha',
    'Control Center Test Production'
  ]::text[],
  'first page ends at the mixed-case boundary'
);
select ok(
  (select bool_and(has_more) from collation_first_page),
  'first page reports more rows'
);
select is(
  (
    select count(*)::integer
    from public.list_installations(
      100,
      (select next_cursor_display_name from collation_first_page limit 1),
      (select next_cursor_id from collation_first_page limit 1)
    )
  ),
  7,
  'cursor crosses the case boundary without skipping rows'
);
select is(
  (
    with second_page as (
      select id
      from public.list_installations(
        100,
        (select next_cursor_display_name from collation_first_page limit 1),
        (select next_cursor_id from collation_first_page limit 1)
      )
    )
    select count(*)::integer
    from collation_first_page
    inner join second_page using (id)
  ),
  0,
  'case-boundary pages contain no duplicates'
);
select is(
  (
    with second_page as (
      select id
      from public.list_installations(
        100,
        (select next_cursor_display_name from collation_first_page limit 1),
        (select next_cursor_id from collation_first_page limit 1)
      )
    )
    select count(*)::integer
    from (
      select id from collation_first_page
      union
      select id from second_page
    ) all_rows
  ),
  12,
  'case-boundary pages contain no gaps'
);
select throws_ok(
  format(
    'select * from public.list_installations(5, %L, %L, null, %L)',
    (select next_cursor_display_name from collation_first_page limit 1),
    (select next_cursor_id from collation_first_page limit 1),
    'staging'
  ),
  '22023',
  'validation_error',
  'cursor from another filter context is rejected'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '68000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;
select throws_ok(
  'select * from public.list_installations()',
  'P0001',
  'unauthorized',
  'non-owner remains rejected'
);
reset role;

select * from finish();
rollback;
