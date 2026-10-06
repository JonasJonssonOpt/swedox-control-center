begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
insert into public.tenants(id,category,legal_name,created_by,updated_by)
values('10000000-0000-4000-8000-000000000001','internal','Mutation security','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','mutation-security','Mutation security','production','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by)
values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active','2021-01-01','00000000-0000-4000-8000-000000000051','2021-01-01','00000000-0000-4000-8000-000000000051');
insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields)
values('40000000-0000-4000-8000-000000000001','license_created','00000000-0000-4000-8000-000000000051','2021-01-01',1,array['id','tenant_id','status','revision']);
insert into public.license_terms_versions values('40000000-0000-4000-8000-000000000001',1,1,'mini',1,'Mini',24,'2021-01-01',null);
set constraints all immediate;
set constraints all deferred;

create temp table mutation_functions(name text, signature regprocedure, call text, input_names text[], defaults integer);
insert into mutation_functions values
('request_provisioning_run','public.request_provisioning_run(uuid,uuid)',
  'select (public.request_provisioning_run($1)).status','{p_installation_id,p_correlation_id}',1),
('start_provisioning_step','public.start_provisioning_step(uuid,bigint,uuid)',
  'select (public.start_provisioning_step($1,1)).status','{p_run_id,p_expected_revision,p_correlation_id}',1),
('complete_provisioning_step','public.complete_provisioning_step(uuid,bigint,text,text,text,text,uuid)',
  'select (public.complete_provisioning_step($1,1)).status','{p_run_id,p_expected_revision,p_supabase_project_ref,p_hosting_region,p_application_url,p_note,p_correlation_id}',5),
('fail_provisioning_step','public.fail_provisioning_step(uuid,bigint,text,text,uuid)',
  $q$select (public.fail_provisioning_step($1,1,'other')).status$q$,'{p_run_id,p_expected_revision,p_failure_category,p_note,p_correlation_id}',2),
('cancel_provisioning_run','public.cancel_provisioning_run(uuid,bigint,uuid)',
  'select (public.cancel_provisioning_run($1,1)).status','{p_run_id,p_expected_revision,p_correlation_id}',1);
grant select on mutation_functions to authenticated, anon, service_role;

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
-- Requests target the installation, all other RPCs the run.
create function pg_temp.target(name text) returns uuid language sql stable security definer as $$
  select case name when 'request_provisioning_run' then '20000000-0000-4000-8000-000000000001'::uuid
    else (select id from public.provisioning_runs limit 1) end
$$;

-- Catalog contract and hardening.
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname=f.name),1,f.name||' has no overloads') from mutation_functions f;
select is(pg_get_function_result(f.signature),'provisioning_runs',f.name||' returns the run composite') from mutation_functions f;
select ok(p.prosecdef and p.provolatile='v' and p.proparallel='u' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and l.lanname='plpgsql',f.name||' exact hardening')
from mutation_functions f join pg_proc p on p.oid=f.signature join pg_language l on l.oid=p.prolang;
select is(p.pronargdefaults::integer,f.defaults,f.name||' exact defaults') from mutation_functions f join pg_proc p on p.oid=f.signature;
select is(p.proargnames,f.input_names,f.name||' only authorized inputs, no actor, status or step') from mutation_functions f join pg_proc p on p.oid=f.signature;
select ok(not has_function_privilege(r,f.signature,'EXECUTE'),r||' cannot execute '||f.name)
from mutation_functions f cross join unnest(array['public','anon','service_role']) r;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f.signature and a.grantee<>p.proowner
  and not(a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable)),0,f.name||' exact nonowner ACL')
from mutation_functions f;
select ok(not p.prosecdef and p.provolatile='s' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'],'block reason helper hardened invoker')
from pg_proc p where p.oid='public.provisioning_block_reason(public.installations,public.tenants)'::regprocedure;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a
  where p.oid='public.provisioning_block_reason(public.installations,public.tenants)'::regprocedure and a.grantee<>p.proowner),0,'block reason helper has no API grant');

-- Every denied claim shape is masked as unauthorized before any lookup or write.
set local role authenticated;
select is(pg_temp.call(f.call,d.claims,pg_temp.target(f.name)),'P0001:unauthorized',f.name||' denies '||d.label)
from mutation_functions f cross join denied_claims d;
select is(pg_temp.call(f.call,d.claims,'30000000-0000-4000-8000-0000000000ff'),'P0001:unauthorized',f.name||' hides not_found from '||d.label)
from mutation_functions f cross join denied_claims d where d.label in ('owner AAL1','non-owner AAL2');
select is(pg_temp.call('select (public.complete_provisioning_step(null,0)).status','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal1"}',null),'P0001:unauthorized','authorization precedes validation');
reset role;
select is((select count(*)::integer from public.provisioning_runs),0,'denied requests created nothing');

-- Owner AAL2 performs the full lifecycle subset; denied claims then change nothing.
set local role authenticated;
select is(pg_temp.call(call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(name)),'allowed:pending','owner AAL2 requests')
from mutation_functions where name='request_provisioning_run';
select is(pg_temp.call(call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(name)),'allowed:in_progress','owner AAL2 starts')
from mutation_functions where name='start_provisioning_step';
select is(pg_temp.call(f.call,d.claims,pg_temp.target(f.name)),'P0001:unauthorized',f.name||' denies '||d.label||' on an existing run')
from mutation_functions f cross join denied_claims d where f.name<>'request_provisioning_run';
reset role;
select results_eq($q$select status,revision from public.provisioning_runs$q$,$q$values ('in_progress'::text,2::bigint)$q$,'denied calls changed nothing');
select is((select count(*)::integer from public.provisioning_audit_events),2,'denied calls wrote no audit');

-- Missing singleton denies even with owner AAL2 claims.
delete from public.control_center_owner;
set local role authenticated;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'P0001:unauthorized',f.name||' denies missing singleton')
from mutation_functions f;
reset role;
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');

-- anon and service_role lack EXECUTE even with owner claims.
set local role anon;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'42501:permission denied for function '||f.name,'anon denied '||f.name)
from mutation_functions f;
reset role;
set local role service_role;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.name)),'42501:permission denied for function '||f.name,'service_role denied '||f.name)
from mutation_functions f;
reset role;

-- Direct writes stay closed even for owner AAL2.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
select throws_ok($q$update public.provisioning_runs set status='succeeded'$q$,'42501',null,'direct run write denied');
select throws_ok($q$insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_after) values(gen_random_uuid(),'run_requested',gen_random_uuid(),1)$q$,'42501',null,'direct audit insert denied');
select throws_ok($q$select public.provisioning_block_reason(null::public.installations,null::public.tenants)$q$,'42501',null,'block reason helper not callable');
reset role;
select * from finish();
rollback;
