begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
insert into public.tenants(id,category,legal_name,created_by,updated_by)
values('10000000-0000-4000-8000-000000000001','internal','Read security','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','security-1','Security 1','production','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.provisioning_runs(id,installation_id,created_by,updated_by)
values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.provisioning_run_steps(run_id,step_key,position) values
('30000000-0000-4000-8000-000000000001','supabase_project',1),('30000000-0000-4000-8000-000000000001','database_schema',2),
('30000000-0000-4000-8000-000000000001','application_deployment',3),('30000000-0000-4000-8000-000000000001','installation_verification',4);
insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_after)
values('30000000-0000-4000-8000-000000000001','run_requested','00000000-0000-4000-8000-000000000051',1);
set constraints all immediate;
set constraints all deferred;

create temp table read_functions(name text, signature regprocedure, call text, input_names text[], defaults integer, result text);
insert into read_functions values
('list_provisioning_runs','public.list_provisioning_runs(integer,timestamptz,uuid,uuid,uuid,text,boolean)',
  'select count(*) from public.list_provisioning_runs(p_installation_id=>$1)',
  array['p_page_size','p_cursor_created_at','p_cursor_id','p_installation_id','p_tenant_id','p_status','p_include_closed'],7,
  'TABLE(id uuid, installation_id uuid, installation_display_name text, installation_code text, tenant_id uuid, tenant_legal_name text, status text, blocked_reason text, next_step_key text, revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone, finished_at timestamp with time zone, has_more boolean, next_cursor_created_at timestamp with time zone, next_cursor_id uuid)'),
('get_provisioning_run','public.get_provisioning_run(uuid)',
  'select count(*) from public.get_provisioning_run($1)',array['p_run_id'],0,
  'TABLE(id uuid, installation_id uuid, installation_display_name text, installation_code text, installation_environment text, tenant_id uuid, tenant_legal_name text, catalog_version integer, status text, blocked_reason text, result_supabase_project_ref text, result_hosting_region text, result_application_url text, revision bigint, created_at timestamp with time zone, updated_at timestamp with time zone, finished_at timestamp with time zone, step_key text, step_position smallint, step_status text, step_attempt_count integer, step_completed_at timestamp with time zone, open_attempt_number integer, open_attempt_started_at timestamp with time zone, is_stale boolean, evaluated_at timestamp with time zone)'),
('list_provisioning_step_attempts','public.list_provisioning_step_attempts(uuid,integer,timestamptz,uuid)',
  'select count(*) from public.list_provisioning_step_attempts($1)',array['p_run_id','p_page_size','p_cursor_started_at','p_cursor_id'],3,
  'TABLE(id uuid, run_id uuid, step_key text, attempt_number integer, started_at timestamp with time zone, started_revision bigint, outcome text, finished_at timestamp with time zone, finished_revision bigint, failure_category text, blocked_reason text, note text, has_more boolean, next_cursor_started_at timestamp with time zone, next_cursor_id uuid)'),
('list_provisioning_audit_events','public.list_provisioning_audit_events(uuid,integer,timestamptz,uuid)',
  'select count(*) from public.list_provisioning_audit_events($1)',array['p_run_id','p_page_size','p_cursor_occurred_at','p_cursor_id'],3,
  'TABLE(id uuid, run_id uuid, event_type text, step_key text, attempt_number integer, actor_user_id uuid, occurred_at timestamp with time zone, revision_before bigint, revision_after bigint, correlation_id uuid, has_more boolean, next_cursor_occurred_at timestamp with time zone, next_cursor_id uuid)');
grant select on read_functions to authenticated, anon, service_role;

create temp table denied_claims(label text, claims text);
insert into denied_claims values
('owner AAL1','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal1"}'),
('non-owner AAL2','{"sub":"00000000-0000-4000-8000-000000000052","aal":"aal2"}'),
('missing subject','{"aal":"aal2"}'),
('missing aal','{"sub":"00000000-0000-4000-8000-000000000051"}'),
('null aal','{"sub":"00000000-0000-4000-8000-000000000051","aal":null}'),
('array aal','{"sub":"00000000-0000-4000-8000-000000000051","aal":["aal2"]}'),
('uppercase aal','{"sub":"00000000-0000-4000-8000-000000000051","aal":"AAL2"}'),
('metadata aal','{"sub":"00000000-0000-4000-8000-000000000051","user_metadata":{"aal":"aal2"}}'),
('AMR only','{"sub":"00000000-0000-4000-8000-000000000051","amr":[{"method":"aal2"}]}'),
('malformed subject','{"sub":"bad","aal":"aal2"}'),
('malformed JSON','{bad');
grant select on denied_claims to authenticated;
create function pg_temp.call(sql text, claims text, target uuid) returns text language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',claims,true);
  begin
    execute sql into result using target;
    return 'allowed:' || result;
  exception when others then
    return sqlstate || ':' || sqlerrm;
  end;
end;
$$;
create function pg_temp.target(name text) returns uuid language sql immutable as $$
  select case name when 'list_provisioning_runs' then '20000000-0000-4000-8000-000000000001'::uuid
    else '30000000-0000-4000-8000-000000000001'::uuid end
$$;

-- Catalog contract and hardening.
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname=f.name),1,f.name||' has no overloads') from read_functions f;
select is(pg_get_function_result(f.signature),f.result,f.name||' returns only allowlisted fields') from read_functions f;
select ok(p.prosecdef and p.provolatile='s' and p.proparallel='u' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and l.lanname='plpgsql',f.name||' exact hardening')
from read_functions f join pg_proc p on p.oid=f.signature join pg_language l on l.oid=p.prolang;
select is(p.pronargdefaults::integer,f.defaults,f.name||' exact defaults') from read_functions f join pg_proc p on p.oid=f.signature;
select is(p.proargnames[1:p.pronargs],f.input_names,f.name||' only authorized input names') from read_functions f join pg_proc p on p.oid=f.signature;
select ok(not has_function_privilege(r,f.signature,'EXECUTE'),r||' cannot execute '||f.name)
from read_functions f cross join unnest(array['public','anon','service_role']) r;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f.signature and a.grantee<>p.proowner
  and not(a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable)),0,f.name||' exact nonowner ACL')
from read_functions f;
select ok(has_function_privilege('authenticated',f.signature,'EXECUTE'),f.name||' authenticated entry') from read_functions f;

-- The helper is internal: no API role may execute it.
select ok(not p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'],'helper hardened security invoker')
from pg_proc p where p.oid='public.is_provisioning_owner_aal2()'::regprocedure;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.is_provisioning_owner_aal2()'::regprocedure and a.grantee<>p.proowner),0,'helper has no API grant');

set local role authenticated;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),
  'allowed:'||case f.name when 'get_provisioning_run' then '4' when 'list_provisioning_step_attempts' then '0' else '1' end,f.name||' owner AAL2 reads')
from read_functions f;
select is(pg_temp.call(f.call,d.claims,pg_temp.target(f.name)),'P0001:unauthorized',f.name||' denies '||d.label)
from read_functions f cross join denied_claims d;
select is(pg_temp.call(f.call,d.claims,'30000000-0000-4000-8000-0000000000ff'),'P0001:unauthorized',f.name||' hides not_found from '||d.label)
from read_functions f cross join denied_claims d where d.label in ('owner AAL1','non-owner AAL2');
select is(pg_temp.call('select count(*) from public.list_provisioning_runs(0)','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal1"}',null),'P0001:unauthorized','authorization precedes validation');
select is(pg_temp.call('select public.is_provisioning_owner_aal2()::text','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',null),
  '42501:permission denied for function is_provisioning_owner_aal2','helper not callable via API');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
select throws_ok(format('select * from public.%I',t),'42501',null,'owner AAL2 cannot read '||t||' directly')
from unnest(array['provisioning_runs','provisioning_run_steps','provisioning_step_attempts','provisioning_audit_events']) t;
select throws_ok($q$update public.provisioning_runs set status='failed'$q$,'42501',null,'direct run write denied');

-- Missing singleton denies even with owner AAL2 claims.
reset role;
delete from public.control_center_owner;
set local role authenticated;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'P0001:unauthorized',f.name||' denies missing singleton')
from read_functions f;
reset role;
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');

-- anon and service_role lack EXECUTE even with owner claims.
set local role anon;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'42501:permission denied for function '||f.name,'anon denied '||f.name)
from read_functions f;
reset role;
set local role service_role;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'42501:permission denied for function '||f.name,'service_role denied '||f.name)
from read_functions f;
reset role;

select results_eq($q$select status,revision from public.provisioning_runs$q$,$q$values ('pending'::text,1::bigint)$q$,'read surfaces changed nothing');
select * from finish();
rollback;
