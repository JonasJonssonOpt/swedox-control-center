begin;
select no_plan();

create temp table provisioning_tables(name text);
insert into provisioning_tables values
('provisioning_runs'),('provisioning_run_steps'),('provisioning_step_attempts'),('provisioning_audit_events');

-- Exact tables and columns.
select has_table('public',name,name||' exists') from provisioning_tables;
select results_eq($q$select (column_name::text||':'||data_type::text||':'||is_nullable::text) collate "default" from information_schema.columns where table_schema='public' and table_name='provisioning_runs' order by ordinal_position$q$,
  $q$values ('id:uuid:NO'::text),('installation_id:uuid:NO'),('catalog_version:integer:NO'),('status:text:NO'),('blocked_reason:text:YES'),
  ('result_supabase_project_ref:text:YES'),('result_hosting_region:text:YES'),('result_application_url:text:YES'),('revision:bigint:NO'),
  ('created_at:timestamp with time zone:NO'),('created_by:uuid:NO'),('updated_at:timestamp with time zone:NO'),('updated_by:uuid:NO'),
  ('finished_at:timestamp with time zone:YES')$q$,'runs exact columns');
select results_eq($q$select (column_name::text||':'||data_type::text||':'||is_nullable::text) collate "default" from information_schema.columns where table_schema='public' and table_name='provisioning_run_steps' order by ordinal_position$q$,
  $q$values ('run_id:uuid:NO'::text),('step_key:text:NO'),('position:smallint:NO'),('status:text:NO'),('attempt_count:integer:NO'),('completed_at:timestamp with time zone:YES')$q$,'steps exact columns');
select results_eq($q$select (column_name::text||':'||data_type::text||':'||is_nullable::text) collate "default" from information_schema.columns where table_schema='public' and table_name='provisioning_step_attempts' order by ordinal_position$q$,
  $q$values ('id:uuid:NO'::text),('run_id:uuid:NO'),('step_key:text:NO'),('attempt_number:integer:NO'),('started_at:timestamp with time zone:NO'),
  ('started_revision:bigint:NO'),('outcome:text:YES'),('finished_at:timestamp with time zone:YES'),('finished_revision:bigint:YES'),
  ('failure_category:text:YES'),('blocked_reason:text:YES'),('note:text:YES')$q$,'attempts exact columns');
select results_eq($q$select (column_name::text||':'||data_type::text||':'||is_nullable::text) collate "default" from information_schema.columns where table_schema='public' and table_name='provisioning_audit_events' order by ordinal_position$q$,
  $q$values ('id:uuid:NO'::text),('run_id:uuid:NO'),('event_type:text:NO'),('step_key:text:YES'),('attempt_number:integer:YES'),('actor_user_id:uuid:NO'),
  ('occurred_at:timestamp with time zone:NO'),('revision_before:bigint:YES'),('revision_after:bigint:NO'),('correlation_id:uuid:YES')$q$,'audit exact columns, no values or notes');

-- Fail-closed access: RLS+FORCE, owner-only ACL, no policies, no API privileges.
select ok(c.relrowsecurity and c.relforcerowsecurity, t.name||' RLS and FORCE RLS')
from provisioning_tables t join pg_class c on c.oid=('public.'||t.name)::regclass;
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=('public.'||t.name)::regclass and a.grantee<>c.relowner),0,t.name||' no non-owner privileges')
from provisioning_tables t;
select is((select count(*)::integer from pg_policy where polrelid=('public.'||t.name)::regclass),0,t.name||' has no policies') from provisioning_tables t;
select ok(not has_table_privilege(r,('public.'||t.name)::regclass,p),r||' lacks '||p||' on '||t.name)
from provisioning_tables t cross join unnest(array['anon','authenticated','service_role']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;

-- Functions: postgres-owned, pinned search_path, no execute for API roles.
select set_eq($q$select proname::text from pg_proc where pronamespace='public'::regnamespace and proname like '%provisioning%' and proname not like '%license%'$q$,
  $q$values ('guard_provisioning_run_modification'),('guard_provisioning_run_step_modification'),('guard_provisioning_step_attempt_modification'),
  ('prevent_provisioning_audit_event_modification'),('enforce_provisioning_run_integrity'),('is_provisioning_owner_aal2'),
  ('list_provisioning_runs'),('get_provisioning_run'),('list_provisioning_step_attempts'),('list_provisioning_audit_events')$q$,'F2E3 structural functions plus F2E4 helper and read RPCs');
select ok(p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.prorettype='trigger'::regtype,p.proname||' hardened trigger function')
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^(guard|prevent|enforce)_provisioning';
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f.oid and a.grantee<>p.proowner),0,f.proname||' no non-owner EXECUTE')
from pg_proc f where f.pronamespace='public'::regnamespace and f.proname ~ '^(guard|prevent|enforce)_provisioning';
select ok(prosecdef,'integrity check is security definer') from pg_proc where proname='enforce_provisioning_run_integrity';
select ok(not prosecdef,proname||' guard is security invoker') from pg_proc where pronamespace='public'::regnamespace and proname like 'guard_provisioning%' or proname='prevent_provisioning_audit_event_modification';

-- Triggers: all enabled; integrity deferred.
select results_eq($q$select (c.relname::text||':'||t.tgname::text||':'||t.tgenabled::text||':'||t.tgdeferrable::text||':'||t.tginitdeferred::text) collate "default"
  from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname like 'provisioning%' and not t.tgisinternal order by 1$q$,
  $q$values ('provisioning_audit_events:trg_provisioning_audit_events_append_only:O:false:false'::text),
  ('provisioning_audit_events:trg_provisioning_audit_events_integrity:O:true:true'),
  ('provisioning_audit_events:trg_provisioning_audit_events_prevent_truncate:O:false:false'),
  ('provisioning_run_steps:trg_provisioning_run_steps_guard:O:false:false'),
  ('provisioning_run_steps:trg_provisioning_run_steps_integrity:O:true:true'),
  ('provisioning_run_steps:trg_provisioning_run_steps_prevent_truncate:O:false:false'),
  ('provisioning_runs:trg_provisioning_runs_guard:O:false:false'),
  ('provisioning_runs:trg_provisioning_runs_integrity:O:true:true'),
  ('provisioning_runs:trg_provisioning_runs_prevent_truncate:O:false:false'),
  ('provisioning_step_attempts:trg_provisioning_step_attempts_guard:O:false:false'),
  ('provisioning_step_attempts:trg_provisioning_step_attempts_integrity:O:true:true'),
  ('provisioning_step_attempts:trg_provisioning_step_attempts_prevent_truncate:O:false:false')$q$,'exact enabled triggers');

-- Indexes.
select results_eq($q$select indexname::text collate "default" from pg_indexes where schemaname='public' and tablename like 'provisioning%' order by 1$q$,
  $q$values ('idx_provisioning_audit_events_run_occurred'::text),('idx_provisioning_runs_created_at_id'),('idx_provisioning_runs_installation_created'),
  ('idx_provisioning_runs_installation_open_unique'),('idx_provisioning_step_attempts_one_open'),('idx_provisioning_step_attempts_run_started'),
  ('pk_provisioning_audit_events'),('pk_provisioning_run_steps'),('pk_provisioning_runs'),('pk_provisioning_step_attempts'),
  ('uq_provisioning_audit_events_run_revision'),('uq_provisioning_run_steps_position'),('uq_provisioning_step_attempts_number'),
  ('uq_provisioning_step_attempts_started_revision')$q$,'exact indexes');
select ok(pg_get_indexdef('public.idx_provisioning_runs_installation_open_unique'::regclass) like '%UNIQUE%WHERE (status <> ALL (ARRAY[''succeeded''::text, ''cancelled''::text]))%','one open run per installation');
select ok(pg_get_indexdef('public.idx_provisioning_step_attempts_one_open'::regclass) like '%UNIQUE%WHERE (outcome IS NULL)%','one open attempt per run');

-- Foreign keys restrict deletes; installation relation, deferred nothing here.
select results_eq($q$select (conname::text||':'||confdeltype::text) collate "default" from pg_constraint where contype='f' and conrelid::regclass::text like 'provisioning%' order by 1$q$,
  $q$values ('fk_provisioning_audit_events_run_id:r'::text),('fk_provisioning_run_steps_run_id:r'),('fk_provisioning_runs_installation_id:r'),('fk_provisioning_step_attempts_step:r')$q$,
  'all foreign keys ON DELETE RESTRICT');

select * from finish();
rollback;
