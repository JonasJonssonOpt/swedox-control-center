begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
insert into public.tenants(id,category,legal_name,created_by,updated_by)
values('10000000-0000-4000-8000-000000000001','internal','Read security','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');

create temp table read_functions(name text, signature regprocedure, call text, target text, input_names text[], defaults integer, result text);
insert into read_functions values
('list_licenses','public.list_licenses(integer,timestamptz,timestamptz,uuid,uuid,text,text,boolean,text)',
  'select count(*) from public.list_licenses(p_tenant_id=>$1)','tenant',
  array['p_page_size','p_evaluated_at','p_cursor_created_at','p_cursor_id','p_tenant_id','p_status','p_validity','p_include_terminated','p_search'],9,
  'TABLE(id uuid, tenant_id uuid, tenant_legal_name text, status text, validity text, plan_key text, plan_display_label text, max_active_users integer, valid_from timestamp with time zone, valid_until timestamp with time zone, revision bigint, current_terms_version bigint, created_at timestamp with time zone, updated_at timestamp with time zone, evaluated_at timestamp with time zone, has_more boolean, next_cursor_created_at timestamp with time zone, next_cursor_id uuid)'),
('get_license','public.get_license(uuid)',
  'select count(*) from public.get_license($1)','license',array['p_license_id'],0,
  'TABLE(id uuid, tenant_id uuid, tenant_legal_name text, status text, validity text, revision bigint, current_terms_version bigint, plan_key text, plan_version integer, plan_display_label text, max_active_users integer, valid_from timestamp with time zone, valid_until timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, evaluated_at timestamp with time zone)'),
('list_license_terms_versions','public.list_license_terms_versions(uuid,integer,bigint)',
  'select count(*) from public.list_license_terms_versions($1)','license',array['p_license_id','p_page_size','p_cursor_version'],2,
  'TABLE(license_id uuid, version bigint, introduced_at_revision bigint, introduced_at timestamp with time zone, plan_key text, plan_version integer, plan_display_label text, max_active_users integer, valid_from timestamp with time zone, valid_until timestamp with time zone, has_more boolean, next_cursor_version bigint)'),
('list_license_audit_events','public.list_license_audit_events(uuid,integer,timestamptz,uuid)',
  'select count(*) from public.list_license_audit_events($1)','license',array['p_license_id','p_page_size','p_cursor_occurred_at','p_cursor_id'],3,
  'TABLE(id uuid, license_id uuid, event_type text, actor_user_id uuid, occurred_at timestamp with time zone, revision_before bigint, revision_after bigint, changed_fields text[], correlation_id uuid, has_more boolean, next_cursor_occurred_at timestamp with time zone, next_cursor_id uuid)'),
('get_license_provisioning_eligibility','public.get_license_provisioning_eligibility(uuid,uuid)',
  'select count(*) from public.get_license_provisioning_eligibility($1)','tenant',array['p_tenant_id','p_installation_id'],1,
  'TABLE(eligible boolean, reason text, evaluated_at timestamp with time zone, license_id uuid, revision bigint, terms_version bigint, valid_until timestamp with time zone)');
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

-- Exact catalog contract and hardening.
select has_function('public',f.name,(select array_agg(format_type(t,null) order by o) from unnest(p.proargtypes) with ordinality as a(t,o)),f.name||' exact signature')
from read_functions f join pg_proc p on p.oid=f.signature;
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname=f.name),1,f.name||' has no overloads') from read_functions f;
select is(pg_get_function_result(f.signature),f.result,f.name||' returns only allowlisted metadata') from read_functions f;
select ok(p.prosecdef and p.provolatile='s' and p.proparallel='u' and p.proowner='postgres'::regrole and p.proconfig=array['search_path=pg_catalog'] and l.lanname='plpgsql',f.name||' exact hardening')
from read_functions f join pg_proc p on p.oid=f.signature join pg_language l on l.oid=p.prolang;
select is(p.pronargdefaults::integer,f.defaults,f.name||' exact defaults') from read_functions f join pg_proc p on p.oid=f.signature;
select is(p.proargnames[1:p.pronargs],f.input_names,f.name||' only authorized input names') from read_functions f join pg_proc p on p.oid=f.signature;
select ok(not has_function_privilege(r,f.signature,'EXECUTE'),r||' cannot execute '||f.name)
from read_functions f cross join unnest(array['public','anon','service_role']) r;
select ok(has_function_privilege('authenticated',f.signature,'EXECUTE'),f.name||' authenticated entry only') from read_functions f;
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f.signature and a.grantee<>p.proowner
  and not(a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable)),0,f.name||' exact nonowner ACL')
from read_functions f;

set local role authenticated;
select lives_ok($q$select public.create_license('10000000-0000-4000-8000-000000000001','mini');set constraints all immediate$q$,'owner AAL2 creates fixture');
set constraints all deferred;
create function pg_temp.target(kind text) returns uuid language sql stable as $$
  select case kind when 'tenant' then '10000000-0000-4000-8000-000000000001'::uuid
    else (select id from public.licenses where tenant_id='10000000-0000-4000-8000-000000000001') end
$$;

-- Owner AAL2 reads every surface.
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.target)),'allowed:1',f.name||' owner AAL2 reads')
from read_functions f;

-- Every denied claim shape is masked as unauthorized before any lookup.
select is(pg_temp.call(f.call,d.claims,pg_temp.target(f.target)),'P0001:unauthorized',f.name||' denies '||d.label)
from read_functions f cross join denied_claims d;
select is(pg_temp.call(f.call,d.claims,'20000000-0000-4000-8000-0000000000ff'),'P0001:unauthorized',f.name||' hides not_found from '||d.label)
from read_functions f cross join denied_claims d where d.label in ('owner AAL1','non-owner AAL2');
select is(pg_temp.call('select count(*) from public.list_licenses(0)','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal1"}',null),'P0001:unauthorized','authorization precedes validation');

-- Missing singleton denies even with owner AAL2 claims.
reset role;
delete from public.control_center_owner;
set local role authenticated;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',pg_temp.target(f.target)),'P0001:unauthorized',f.name||' denies missing singleton')
from read_functions f;
reset role;
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');

-- anon/service_role lack EXECUTE even with owner claims.
set local role anon;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}','20000000-0000-4000-8000-0000000000ff'),'42501:permission denied for function '||f.name,'anon denied '||f.name)
from read_functions f;
reset role;
set local role service_role;
select is(pg_temp.call(f.call,'{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}','20000000-0000-4000-8000-0000000000ff'),'42501:permission denied for function '||f.name,'service_role denied '||f.name)
from read_functions f;
reset role;

-- Read RPCs open no table path: audit and writes stay closed.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
select throws_ok('select * from public.license_audit_events','42501',null,'audit table read remains closed');
select throws_ok($q$update public.licenses set status='active'$q$,'42501',null,'direct license write remains denied');
reset role;
select results_eq($q$select status,revision from public.licenses$q$,$q$values ('draft'::text,1::bigint)$q$,'read surfaces changed nothing');
select is((select count(*)::integer from public.license_audit_events),1,'read surfaces wrote no audit');
select * from finish();
rollback;
