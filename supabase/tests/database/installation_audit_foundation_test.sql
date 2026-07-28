begin;

select no_plan();

select has_table(
  'public',
  'installation_audit_events',
  'the installation audit table exists'
);
select columns_are(
  'public',
  'installation_audit_events',
  array[
    'id',
    'installation_id',
    'event_type',
    'actor_user_id',
    'occurred_at',
    'revision_before',
    'revision_after',
    'changed_fields',
    'correlation_id'
  ],
  'installation audit has exactly the locked nine columns'
);

select col_type_is('public', 'installation_audit_events', 'id', 'uuid', 'id is uuid');
select col_type_is('public', 'installation_audit_events', 'installation_id', 'uuid', 'installation_id is uuid');
select col_type_is('public', 'installation_audit_events', 'event_type', 'text', 'event_type is text');
select col_type_is('public', 'installation_audit_events', 'actor_user_id', 'uuid', 'actor_user_id is uuid');
select col_type_is('public', 'installation_audit_events', 'occurred_at', 'timestamp with time zone', 'occurred_at is timestamptz');
select col_type_is('public', 'installation_audit_events', 'revision_before', 'bigint', 'revision_before is bigint');
select col_type_is('public', 'installation_audit_events', 'revision_after', 'bigint', 'revision_after is bigint');
select col_type_is('public', 'installation_audit_events', 'changed_fields', 'text[]', 'changed_fields is text array');
select col_type_is('public', 'installation_audit_events', 'correlation_id', 'uuid', 'correlation_id is uuid');

select col_not_null('public', 'installation_audit_events', 'id', 'id is required');
select col_not_null('public', 'installation_audit_events', 'installation_id', 'installation_id is required');
select col_not_null('public', 'installation_audit_events', 'event_type', 'event_type is required');
select col_not_null('public', 'installation_audit_events', 'actor_user_id', 'actor is required');
select col_not_null('public', 'installation_audit_events', 'occurred_at', 'occurred_at is required');
select col_is_null('public', 'installation_audit_events', 'revision_before', 'revision_before is nullable for create');
select col_not_null('public', 'installation_audit_events', 'revision_after', 'revision_after is required');
select col_not_null('public', 'installation_audit_events', 'changed_fields', 'changed_fields is required');
select col_is_null('public', 'installation_audit_events', 'correlation_id', 'correlation_id is nullable');
select col_has_default('public', 'installation_audit_events', 'id', 'id is generated');
select col_has_default('public', 'installation_audit_events', 'occurred_at', 'occurred_at is generated');

select is(
  (select conname from pg_constraint
   where conrelid = 'public.installation_audit_events'::regclass and contype = 'p'),
  'pk_installation_audit_events',
  'primary key is explicitly named'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.installation_audit_events'::regclass
     and conname = 'fk_installation_audit_events_installation_id'
     and contype = 'f'
     and confrelid = 'public.installations'::regclass
     and confdeltype = 'r'),
  1,
  'installation relation uses delete restrict'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.installation_audit_events'::regclass
     and conname = 'uq_installation_audit_events_installation_revision'
     and contype = 'u'),
  1,
  'revision_after is unique per installation'
);
select set_eq(
  $$select conname from pg_constraint
    where conrelid = 'public.installation_audit_events'::regclass
      and contype = 'c'$$,
  $$values
    ('ck_installation_audit_events_event_type'::name),
    ('ck_installation_audit_events_revisions'::name),
    ('ck_installation_audit_events_changed_fields'::name)$$,
  'the three locked check constraints exist'
);

select has_index(
  'public',
  'installation_audit_events',
  'idx_installation_audit_events_installation_occurred',
  'chronological installation audit index exists'
);
select is(
  (select pg_get_indexdef(indexrelid) from pg_index
   where indexrelid = 'public.idx_installation_audit_events_installation_occurred'::regclass),
  'CREATE INDEX idx_installation_audit_events_installation_occurred ON public.installation_audit_events USING btree (installation_id, occurred_at DESC, id DESC)',
  'chronological index has stable cursor order'
);

select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.installation_audit_events'::regclass
     and tgname = 'trg_installation_audit_events_append_only'
     and not tgisinternal),
  1,
  'append-only trigger exists'
);
select is(
  (select count(*)::integer from pg_proc
   where oid = 'public.prevent_installation_audit_event_modification()'::regprocedure
     and not prosecdef
     and provolatile = 'v'
     and proparallel = 'u'
     and proconfig = array['search_path=pg_catalog']::text[]
     and proowner = 'postgres'::regrole),
  1,
  'append-only trigger function has locked execution properties'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
   where has_function_privilege(
     role_name,
     'public.prevent_installation_audit_event_modification()',
     'EXECUTE'
   )),
  0,
  'API roles cannot execute the trigger function'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.installation_audit_events'::regclass),
  true,
  'installation audit RLS is enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.installation_audit_events'::regclass),
  true,
  'installation audit FORCE RLS is enabled'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and tablename = 'installation_audit_events'),
  0,
  'installation audit has no policies'
);
select is(
  (select count(*)::integer
   from (values ('public'), ('anon'), ('authenticated'), ('service_role')) roles(role_name)
   cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) privileges(privilege_name)
   where has_table_privilege(role_name, 'public.installation_audit_events', privilege_name)),
  0,
  'all API roles have zero direct audit privileges'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '30000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'installation-audit-actor@example.invalid', '',
  current_timestamp, current_timestamp, current_timestamp, '', '', '', ''
);

insert into public.tenants
  (id, category, legal_name, created_by, updated_by)
values (
  '30000000-0000-4000-8000-000000000011',
  'internal',
  'Installation Audit Tenant',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001'
);

insert into public.installations
  (id, tenant_id, installation_code, display_name, environment, created_by, updated_by)
values
  (
    '30000000-0000-4000-8000-000000000021',
    '30000000-0000-4000-8000-000000000011',
    'audit-primary', 'Audit Primary', 'production',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000022',
    '30000000-0000-4000-8000-000000000011',
    'audit-secondary', 'Audit Secondary', 'staging',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  );

select lives_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields
    ) values (
      '30000000-0000-4000-8000-000000000021',
      'installation_created',
      '30000000-0000-4000-8000-000000000001',
      null, 1,
      array[
        'id', 'tenant_id', 'installation_code', 'display_name', 'environment',
        'administrative_status', 'revision', 'created_at', 'created_by',
        'updated_at', 'updated_by'
      ]
    )$$,
  'canonical create metadata is valid'
);

select lives_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields, correlation_id
    ) values (
      '30000000-0000-4000-8000-000000000021',
      'installation_edited',
      '30000000-0000-4000-8000-000000000001',
      1, 2,
      array['display_name', 'updated_at', 'updated_by'],
      '30000000-0000-4000-8000-000000000099'
    )$$,
  'canonical edit metadata with correlation ID is valid'
);

select lives_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id, revision_before,
      revision_after, changed_fields
    ) values
      ('30000000-0000-4000-8000-000000000021', 'installation_activated',
       '30000000-0000-4000-8000-000000000001', 2, 3, array['administrative_status']),
      ('30000000-0000-4000-8000-000000000021', 'installation_paused',
       '30000000-0000-4000-8000-000000000001', 3, 4, array['administrative_status']),
      ('30000000-0000-4000-8000-000000000021', 'installation_decommissioned',
       '30000000-0000-4000-8000-000000000001', 4, 5, array['administrative_status']),
      ('30000000-0000-4000-8000-000000000021', 'installation_archived',
       '30000000-0000-4000-8000-000000000001', 5, 6, array['archived_at', 'archived_by']),
      ('30000000-0000-4000-8000-000000000021', 'installation_restored',
       '30000000-0000-4000-8000-000000000001', 6, 7, array['archived_at', 'archived_by'])$$,
  'all five remaining installation event types are valid'
);

create function pg_temp.audit_insert_state(
  target uuid,
  kind text,
  before_revision bigint,
  after_revision bigint,
  fields text[]
) returns text
language plpgsql
as $$
begin
  insert into public.installation_audit_events (
    installation_id, event_type, actor_user_id,
    revision_before, revision_after, changed_fields
  ) values (
    target, kind, '30000000-0000-4000-8000-000000000001',
    before_revision, after_revision, fields
  );
  return 'accepted';
exception when others then
  return sqlstate;
end;
$$;

select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'provisioning_started', null, 1, array['id']
), '23514', 'provisioning event is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'deployment_updated', null, 1, array['id']
), '23514', 'deployment event is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'health_changed', null, 1, array['id']
), '23514', 'health event is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'alert_created', null, 1, array['id']
), '23514', 'alert event is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'unknown', null, 1, array['id']
), '23514', 'unknown event is rejected');

select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', 1, 1, array['id']
), '23514', 'create with revision_before is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 2, array['id']
), '23514', 'create with revision_after other than one is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_edited', 0, 1, array['display_name']
), '23514', 'zero revision is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_edited', -1, 0, array['display_name']
), '23514', 'negative revision is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_edited', 1, 3, array['display_name']
), '23514', 'revision jump is rejected');

select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1, array[]::text[]
), '23514', 'empty changed_fields is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1,
  array[['id', 'tenant_id'], ['installation_code', 'display_name']]
), '23514', 'multidimensional changed_fields is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1, array['id', null]
), '23514', 'null changed field is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1, array['id', 'id']
), '23514', 'duplicate changed field is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1, array['secret']
), '23514', 'unknown changed field is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1,
  array['display_name', 'installation_code']
), '23514', 'non-canonical changed-field order is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1,
  array['application_url.host']
), '23514', 'dotted changed-field path is rejected');
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1,
  array['display_name=secret']
), '23514', 'payload-like changed field is rejected');

select lives_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id,
      revision_before, revision_after, changed_fields
    ) values (
      '30000000-0000-4000-8000-000000000022',
      'installation_created',
      '30000000-0000-4000-8000-000000000001',
      null, 1, array['id']
    )$$,
  'the same revision_after is valid for another installation'
);
select is(pg_temp.audit_insert_state(
  '30000000-0000-4000-8000-000000000022', 'installation_created', null, 1, array['id']
), '23505', 'duplicate revision_after for one installation is rejected');

select throws_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id,
      revision_before, revision_after, changed_fields
    ) values (
      '30000000-0000-4000-8000-000000000404',
      'installation_created',
      '30000000-0000-4000-8000-000000000001',
      null, 1, array['id']
    )$$,
  '23503', null, 'missing installation is rejected'
);
select throws_ok(
  $$delete from public.installations
    where id = '30000000-0000-4000-8000-000000000021'$$,
  '23503', null, 'installation delete is restricted while audit exists'
);

select lives_ok(
  $$delete from auth.users
    where id = '30000000-0000-4000-8000-000000000001'$$,
  'actor Auth-user deletion is not blocked by audit'
);
select is(
  (select count(*)::integer from public.installation_audit_events
   where actor_user_id = '30000000-0000-4000-8000-000000000001'),
  8,
  'audit survives actor Auth-user deletion'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.installation_audit_events'::regclass
     and confrelid = 'auth.users'::regclass),
  0,
  'audit actor has no Auth FK'
);

select throws_ok(
  $$update public.installation_audit_events
    set changed_fields = changed_fields
    where installation_id = '30000000-0000-4000-8000-000000000021'$$,
  '55000',
  'installation audit events are append-only',
  'privileged UPDATE is blocked by stable append-only error'
);
select throws_ok(
  $$delete from public.installation_audit_events
    where installation_id = '30000000-0000-4000-8000-000000000021'$$,
  '55000',
  'installation audit events are append-only',
  'privileged DELETE is blocked by stable append-only error'
);

set local role anon;
select throws_ok(
  'select * from public.installation_audit_events',
  '42501', null, 'anon cannot read installation audit'
);
select throws_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id,
      revision_before, revision_after, changed_fields
    ) values (
      '30000000-0000-4000-8000-000000000022',
      'installation_edited',
      '30000000-0000-4000-8000-000000000002',
      1, 2, array['display_name']
    )$$,
  '42501', null, 'anon cannot insert installation audit'
);
reset role;

set local role authenticated;
select throws_ok(
  'select * from public.installation_audit_events',
  '42501', null, 'authenticated cannot directly read installation audit'
);
select throws_ok(
  $$insert into public.installation_audit_events (
      installation_id, event_type, actor_user_id,
      revision_before, revision_after, changed_fields
    ) values (
      '30000000-0000-4000-8000-000000000022',
      'installation_edited',
      '30000000-0000-4000-8000-000000000002',
      1, 2, array['display_name']
    )$$,
  '42501', null, 'authenticated cannot insert installation audit'
);
reset role;

select * from finish();

rollback;
