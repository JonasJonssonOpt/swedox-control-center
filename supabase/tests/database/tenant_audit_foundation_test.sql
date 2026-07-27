begin;

select no_plan();

select has_table(
  'public',
  'tenant_audit_events',
  'the tenant audit table exists'
);
select columns_are(
  'public',
  'tenant_audit_events',
  array[
    'id',
    'tenant_id',
    'event_type',
    'actor_user_id',
    'occurred_at',
    'revision_before',
    'revision_after',
    'changed_fields',
    'correlation_id'
  ],
  'the tenant audit table has exactly the locked nine columns'
);

select col_type_is('public', 'tenant_audit_events', 'id', 'uuid', 'audit id is uuid');
select col_type_is(
  'public',
  'tenant_audit_events',
  'tenant_id',
  'uuid',
  'tenant id is uuid'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'event_type',
  'text',
  'event type is text'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'actor_user_id',
  'uuid',
  'actor id is uuid'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'occurred_at',
  'timestamp with time zone',
  'occurred at is timestamptz'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'revision_before',
  'bigint',
  'revision before is bigint'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'revision_after',
  'bigint',
  'revision after is bigint'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'changed_fields',
  'text[]',
  'changed fields is text array'
);
select col_type_is(
  'public',
  'tenant_audit_events',
  'correlation_id',
  'uuid',
  'correlation id is uuid'
);

select col_not_null('public', 'tenant_audit_events', 'id', 'audit id is required');
select col_not_null(
  'public',
  'tenant_audit_events',
  'tenant_id',
  'tenant id is required'
);
select col_not_null(
  'public',
  'tenant_audit_events',
  'event_type',
  'event type is required'
);
select col_not_null(
  'public',
  'tenant_audit_events',
  'actor_user_id',
  'actor is required'
);
select col_not_null(
  'public',
  'tenant_audit_events',
  'occurred_at',
  'occurred at is required'
);
select col_is_null(
  'public',
  'tenant_audit_events',
  'revision_before',
  'revision before is nullable only for create by constraint'
);
select col_not_null(
  'public',
  'tenant_audit_events',
  'revision_after',
  'revision after is required'
);
select col_not_null(
  'public',
  'tenant_audit_events',
  'changed_fields',
  'changed fields is required'
);
select col_is_null(
  'public',
  'tenant_audit_events',
  'correlation_id',
  'correlation id is optional'
);
select col_has_default(
  'public',
  'tenant_audit_events',
  'id',
  'audit id is database generated'
);
select col_has_default(
  'public',
  'tenant_audit_events',
  'occurred_at',
  'occurred at is database generated'
);

select is(
  (
    select conname
    from pg_constraint
    where conrelid = 'public.tenant_audit_events'::regclass
      and contype = 'p'
  ),
  'pk_tenant_audit_events',
  'the audit primary key is explicitly named'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tenant_audit_events'::regclass
      and conname = 'fk_tenant_audit_events_tenant_id'
      and contype = 'f'
      and confrelid = 'public.tenants'::regclass
      and confdeltype = 'r'
  ),
  1,
  'tenant audit uses a restrict tenant foreign key'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tenant_audit_events'::regclass
      and conname = 'uq_tenant_audit_events_tenant_revision'
      and contype = 'u'
  ),
  1,
  'tenant revision is unique within each tenant'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tenant_audit_events'::regclass
      and conname in (
        'ck_tenant_audit_events_event_type',
        'ck_tenant_audit_events_revisions',
        'ck_tenant_audit_events_changed_fields'
      )
      and contype = 'c'
  ),
  3,
  'all three audit check constraints exist'
);
select has_index(
  'public',
  'tenant_audit_events',
  'idx_tenant_audit_events_tenant_occurred',
  'the chronological tenant audit index exists'
);
select is(
  (
    select pg_get_indexdef(indexrelid)
    from pg_index
    where indexrelid =
      'public.idx_tenant_audit_events_tenant_occurred'::regclass
  ),
  'CREATE INDEX idx_tenant_audit_events_tenant_occurred ON public.tenant_audit_events USING btree (tenant_id, occurred_at DESC, id DESC)',
  'the chronological index has the expected stable order'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.tenant_audit_events'::regclass
      and tgname = 'trg_tenant_audit_events_append_only'
      and not tgisinternal
  ),
  1,
  'the append-only trigger exists'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where oid =
      'public.prevent_tenant_audit_event_modification()'::regprocedure
      and not prosecdef
      and provolatile = 'v'
      and proconfig = array['search_path=pg_catalog']::text[]
      and proowner = 'postgres'::regrole
  ),
  1,
  'the append-only trigger function has the locked execution properties'
);
select ok(
  not has_function_privilege(
    'public',
    'public.prevent_tenant_audit_event_modification()',
    'EXECUTE'
  ),
  'PUBLIC cannot execute the append-only trigger function'
);

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000031');

insert into public.tenants (
  id,
  category,
  legal_name,
  created_by,
  updated_by
)
values (
  '20000000-0000-4000-8000-000000000001',
  'internal',
  'Audit test tenant',
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000031'
);

select lives_ok(
  $$insert into public.tenant_audit_events (
      id,
      tenant_id,
      event_type,
      actor_user_id,
      revision_before,
      revision_after,
      changed_fields
    )
    values (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'tenant_created',
      '00000000-0000-4000-8000-000000000031',
      null,
      1,
      array['category', 'id', 'legal_name', 'revision']
    )$$,
  'a valid create audit event is accepted'
);
select ok(
  (
    select occurred_at <= current_timestamp
    from public.tenant_audit_events
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  'the event timestamp is database generated'
);

select lives_ok(
  $$insert into public.tenant_audit_events (
      tenant_id, event_type, actor_user_id, revision_before, revision_after,
      changed_fields, correlation_id
    )
    values (
      '20000000-0000-4000-8000-000000000001',
      'tenant_edited',
      '00000000-0000-4000-8000-000000000031',
      1,
      2,
      array['administrative_note', 'contact_email', 'legal_name'],
      '40000000-0000-4000-8000-000000000001'
    )$$,
  'an edit event with metadata-only changed fields is accepted'
);
select lives_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_paused',
     '00000000-0000-4000-8000-000000000031', 2, 3,
     array['operational_status'])$$,
  'a pause event is representable'
);
select lives_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_activated',
     '00000000-0000-4000-8000-000000000031', 3, 4,
     array['operational_status'])$$,
  'an activate event is representable'
);
select lives_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_archived',
     '00000000-0000-4000-8000-000000000031', 4, 5,
     array['archived_at', 'archived_by'])$$,
  'an archive event is representable'
);
select lives_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_restored',
     '00000000-0000-4000-8000-000000000031', 5, 6,
     array['archived_at', 'archived_by', 'operational_status'])$$,
  'a restore event is representable'
);

select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_deleted',
     '00000000-0000-4000-8000-000000000031', 6, 7, array['id'])$$,
  '23514',
  null,
  'an unknown event type is rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 0, 1, array['legal_name'])$$,
  '23514',
  null,
  'zero previous revision is rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', -1, 0, array['legal_name'])$$,
  '23514',
  null,
  'negative revisions are rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 1, 3, array['legal_name'])$$,
  '23514',
  null,
  'a skipped revision is rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_created',
     '00000000-0000-4000-8000-000000000031', 0, 1, array['id'])$$,
  '23514',
  null,
  'create must have null previous revision'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_created',
     '00000000-0000-4000-8000-000000000031', null, 2, array['id'])$$,
  '23514',
  null,
  'create must produce revision one'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 1, 2, array['legal_name'])$$,
  '23505',
  null,
  'a tenant revision cannot have two audit events'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000099', 'tenant_created',
     '00000000-0000-4000-8000-000000000031', null, 1, array['id'])$$,
  '23503',
  null,
  'an unknown tenant is rejected'
);

select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7, array[]::text[])$$,
  '23514',
  null,
  'empty changed fields are rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7,
     array['legal_name', 'secret'])$$,
  '23514',
  null,
  'unknown changed field names are rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7,
     array['legal_name', 'contact_email'])$$,
  '23514',
  null,
  'changed fields must use canonical order'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7,
     array['legal_name', 'legal_name'])$$,
  '23514',
  null,
  'duplicate changed fields are rejected'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7,
     array['legal_name', null])$$,
  '23514',
  null,
  'null changed fields are rejected'
);

select throws_ok(
  $$update public.tenant_audit_events
    set correlation_id = '40000000-0000-4000-8000-000000000002'
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '55000',
  'tenant audit events are append-only',
  'an existing audit event cannot be updated even by the test owner'
);
select throws_ok(
  $$delete from public.tenant_audit_events
    where id = '30000000-0000-4000-8000-000000000001'$$,
  '55000',
  'tenant audit events are append-only',
  'an existing audit event cannot be deleted even by the test owner'
);
select throws_ok(
  $$delete from public.tenants
    where id = '20000000-0000-4000-8000-000000000001'$$,
  '23503',
  null,
  'tenant deletion cannot cascade away audit history'
);
select lives_ok(
  $$delete from auth.users
    where id = '00000000-0000-4000-8000-000000000031'$$,
  'the historical audit actor has no Auth FK'
);
select is(
  (
    select count(*)::integer
    from public.tenant_audit_events
    where actor_user_id = '00000000-0000-4000-8000-000000000031'
  ),
  6,
  'audit history survives deletion of its Auth actor'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tenant_audit_events'::regclass),
  'audit RLS is enabled'
);
select ok(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.tenant_audit_events'::regclass
  ),
  'audit RLS is forced'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public' and tablename = 'tenant_audit_events'
  ),
  0,
  'audit has no direct read or write policies'
);
select ok(
  not has_table_privilege(
    'public',
    'public.tenant_audit_events',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'PUBLIC has no audit table privileges'
);
select ok(
  not has_table_privilege(
    'anon',
    'public.tenant_audit_events',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'anon has no audit table privileges'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.tenant_audit_events',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'authenticated has no audit table privileges'
);
select ok(
  not has_table_privilege(
    'service_role',
    'public.tenant_audit_events',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ),
  'service_role has no audit table privileges'
);

set local role anon;
select throws_ok(
  'select * from public.tenant_audit_events',
  '42501',
  null,
  'anon cannot read audit'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7, array['legal_name'])$$,
  '42501',
  null,
  'anon cannot insert audit'
);
select throws_ok(
  'update public.tenant_audit_events set changed_fields = changed_fields',
  '42501',
  null,
  'anon cannot update audit'
);
select throws_ok(
  'delete from public.tenant_audit_events',
  '42501',
  null,
  'anon cannot delete audit'
);
reset role;

set local role authenticated;
select throws_ok(
  'select * from public.tenant_audit_events',
  '42501',
  null,
  'authenticated owner sessions cannot read audit directly in E3'
);
select throws_ok(
  $$insert into public.tenant_audit_events
    (tenant_id, event_type, actor_user_id, revision_before, revision_after, changed_fields)
    values
    ('20000000-0000-4000-8000-000000000001', 'tenant_edited',
     '00000000-0000-4000-8000-000000000031', 6, 7, array['legal_name'])$$,
  '42501',
  null,
  'authenticated cannot insert audit'
);
select throws_ok(
  'update public.tenant_audit_events set changed_fields = changed_fields',
  '42501',
  null,
  'authenticated cannot update audit'
);
select throws_ok(
  'delete from public.tenant_audit_events',
  '42501',
  null,
  'authenticated cannot delete audit'
);
reset role;

select * from finish();

rollback;
