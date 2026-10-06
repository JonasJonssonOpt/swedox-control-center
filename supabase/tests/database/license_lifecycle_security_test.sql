begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
insert into public.tenants(id,category,legal_name,created_by,updated_by)
values('10000000-0000-4000-8000-000000000001','internal','Lifecycle security','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
create function pg_temp.lic() returns uuid language sql stable as $$
  select id from public.licenses where tenant_id='10000000-0000-4000-8000-000000000001'
$$;
create temp table lifecycle_functions(name text, signature regprocedure);
insert into lifecycle_functions values
('activate_license','public.activate_license(uuid,bigint,uuid)'),
('suspend_license','public.suspend_license(uuid,bigint,uuid)'),
('terminate_license','public.terminate_license(uuid,bigint,uuid)');
grant select on lifecycle_functions to authenticated, anon, service_role;

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
create function pg_temp.denied(fn text, claims text, license uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',claims,true);
  begin
    execute format('select public.%I($1,1)',fn) using license;
    return 'allowed';
  exception when others then
    return sqlstate || ':' || sqlerrm;
  end;
end;
$$;
select has_function('public',name,array['uuid','bigint','uuid'],name||' exact signature') from lifecycle_functions;
select function_returns('public',name,array['uuid','bigint','uuid'],'licenses',name||' exact composite return') from lifecycle_functions;
select ok(p.prosecdef and p.provolatile='v' and p.proparallel='u' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and p.pronargdefaults=1 and l.lanname='plpgsql',f.name||' exact hardening and defaults')
from lifecycle_functions f join pg_proc p on p.oid=f.signature join pg_language l on l.oid=p.prolang;
select is(p.proargnames,array['p_license_id','p_expected_revision','p_correlation_id'],f.name||' only authorized input names')
from lifecycle_functions f join pg_proc p on p.oid=f.signature;
select ok(not has_function_privilege(r,f.signature,'EXECUTE'),r||' cannot execute '||f.name)
from lifecycle_functions f cross join unnest(array['public','anon','service_role']) r;
select ok(has_function_privilege('authenticated',f.signature,'EXECUTE'),f.name||' authenticated entry only') from lifecycle_functions f;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f.signature and a.grantee<>p.proowner
  and not(a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable)),0,f.name||' exact nonowner ACL')
from lifecycle_functions f;
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname in ('activate_license','suspend_license','terminate_license')),3,'no overloads');

set local role authenticated;
select lives_ok($q$select public.create_license('10000000-0000-4000-8000-000000000001','mini');set constraints all immediate$q$,'owner AAL2 creates fixture');
set constraints all deferred;

-- Every denied claim shape is masked as unauthorized before any lookup.
select is(pg_temp.denied(f.name,d.claims,'10000000-0000-4000-8000-000000000001'),'P0001:unauthorized',f.name||' denies '||d.label)
from lifecycle_functions f cross join denied_claims d;
select is(pg_temp.denied(f.name,d.claims,'20000000-0000-4000-8000-0000000000ff'),'P0001:unauthorized',f.name||' denies missing license without disclosure: '||d.label)
from lifecycle_functions f cross join denied_claims d where d.label in ('owner AAL1','non-owner AAL2');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
reset role;
select results_eq($q$select status,revision from public.licenses$q$,$q$values ('draft'::text,1::bigint)$q$,'denied claims changed nothing');
select is((select count(*)::integer from public.license_audit_events),1,'denied claims wrote no audit');

-- Missing singleton denies even with owner AAL2 claims.
delete from public.control_center_owner;
set local role authenticated;
select is(pg_temp.denied(f.name,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.lic()),'P0001:unauthorized',f.name||' denies missing singleton')
from lifecycle_functions f;
reset role;
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');

-- anon/service_role lack EXECUTE even with owner claims.
set local role anon;
select is(pg_temp.denied(f.name,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}','20000000-0000-4000-8000-0000000000ff'),'42501:permission denied for function '||f.name,'anon denied '||f.name)
from lifecycle_functions f;
reset role;
set local role service_role;
select is(pg_temp.denied(f.name,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}','20000000-0000-4000-8000-0000000000ff'),'42501:permission denied for function '||f.name,'service_role denied '||f.name)
from lifecycle_functions f;
reset role;

-- Owner AAL2 works; direct writes and audit reads stay closed.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
select lives_ok($q$select public.activate_license(pg_temp.lic(),1);select public.suspend_license(pg_temp.lic(),2);select public.terminate_license(pg_temp.lic(),3);set constraints all immediate$q$,'owner AAL2 lifecycle RPCs work');
set constraints all deferred;
select throws_ok($q$update public.licenses set status='active'$q$,'42501',null,'direct status write remains denied');
select throws_ok('select * from public.license_audit_events','42501',null,'audit read remains closed');
reset role;
select results_eq($q$select status,revision from public.licenses$q$,$q$values ('terminated'::text,4::bigint)$q$,'owner lifecycle reached terminated at revision 4');
select * from finish();
rollback;
