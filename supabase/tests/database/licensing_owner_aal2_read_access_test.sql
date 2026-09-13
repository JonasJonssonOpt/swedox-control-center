begin;
select no_plan();

select has_function('public', 'is_licensing_owner_aal2', array[]::text[], 'argumentless Licensing helper exists');
select function_returns('public', 'is_licensing_owner_aal2', array[]::text[], 'boolean', 'helper returns only boolean');
select ok(not prosecdef, 'helper is SECURITY INVOKER') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(provolatile::text, 's', 'helper is STABLE') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(proparallel::text, 'u', 'helper is PARALLEL UNSAFE like its dependencies') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(proconfig, array['search_path=pg_catalog'], 'helper locks search_path') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(proowner::regrole::text, 'postgres', 'helper owner is postgres') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(l.lanname, 'plpgsql', 'helper language') from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.is_licensing_owner_aal2()'::regprocedure;
select is(pronargs::integer, 0, 'helper has no arguments') from pg_proc where oid='public.is_licensing_owner_aal2()'::regprocedure;
select ok(not has_function_privilege(r, 'public.is_licensing_owner_aal2()', 'EXECUTE'), r || ' has no helper EXECUTE') from unnest(array['public','anon','service_role']) r;
select ok(has_function_privilege('authenticated', 'public.is_licensing_owner_aal2()', 'EXECUTE'), 'authenticated can evaluate helper');
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid='public.is_licensing_owner_aal2()'::regprocedure and a.grantee<>p.proowner and not (a.grantee='authenticated'::regrole and a.privilege_type='EXECUTE' and not a.is_grantable)), 0, 'only authenticated helper grant without grant option');
select set_eq($q$select proname::text from pg_proc where pronamespace='public'::regnamespace and (proname like '%license%' or proname like '%licensing%')$q$, $q$values ('is_licensing_owner_aal2'),('prevent_license_terms_version_modification'),('prevent_license_audit_event_modification'),('enforce_license_history_integrity'),('create_license')$q$, 'authorization helper, structural triggers and F2D5A create RPC');

select is((select count(*)::integer from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions','license_audit_events')), 2, 'exactly two Licensing policies');
select is(policyname::text, tablename || '_owner_aal2_select', tablename || ' exact policy name') from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions');
select is(cmd, 'SELECT', tablename || ' only SELECT') from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions');
select is(roles, array['authenticated']::name[], tablename || ' authenticated only') from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions');
select is(qual, 'is_licensing_owner_aal2()', tablename || ' exact combined predicate without domain filters') from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions');
select ok(with_check is null, tablename || ' no WITH CHECK') from pg_policies where schemaname='public' and tablename in ('licenses','license_terms_versions');
select ok(relrowsecurity and relforcerowsecurity, relname || ' RLS and FORCE remain enabled') from pg_class where oid in ('public.licenses'::regclass,'public.license_terms_versions'::regclass,'public.license_audit_events'::regclass);
select ok(has_table_privilege('authenticated', t, 'SELECT'), t || ' authenticated SELECT grant') from unnest(array['public.licenses','public.license_terms_versions']) t;
select ok(not has_table_privilege(r,t,p), r || ' denied ' || p || ' on ' || t)
from unnest(array['public','anon','authenticated','service_role']) r
cross join unnest(array['public.licenses','public.license_terms_versions','public.license_audit_events']) t
cross join unnest(array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p;
select ok(not has_table_privilege(r,t,'SELECT'), r || ' denied SELECT on ' || t)
from unnest(array['public','anon','service_role']) r
cross join unnest(array['public.licenses','public.license_terms_versions','public.license_audit_events']) t;
select ok(not has_table_privilege('authenticated','public.license_audit_events','SELECT'), 'authenticated has no direct audit SELECT');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='license_audit_events'),0,'audit has no policies');

-- Only synthetic identities; request context follows the local auth.jwt()/uid().
insert into auth.users(id) values ('00000000-0000-4000-8000-000000000031'),('00000000-0000-4000-8000-000000000032');
insert into public.tenants(id,category,legal_name,operational_status,archived_at,archived_by,created_by,updated_by)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, 'internal', 'Licensing security fixture ' || n,
case when n=2 then 'paused' else 'active' end,
case when n=3 then current_timestamp else null end,
case when n=3 then '00000000-0000-4000-8000-000000000031'::uuid else null end,
'00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000031'
from generate_series(1,4) n;
insert into public.licenses(id,tenant_id,status,revision,current_terms_version,created_by,updated_by)
select ('20000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || n)::uuid,
(array['draft','active','suspended','terminated'])[n], case when n=1 then 2 else 1 end, case when n=1 then 2 else 1 end,
'00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000031'
from generate_series(1,4) n;
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields)
select id,'license_created',created_by,1,array['id'] from public.licenses;
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields)
values ('20000000-0000-4000-8000-000000000001','license_terms_changed','00000000-0000-4000-8000-000000000031',1,2,array['current_terms_version']);
insert into public.license_terms_versions
select id,1,1,'mini',1,'Mini',24,
case when status='suspended' then current_timestamp+interval '1 day' else current_timestamp-interval '2 days' end,
case when status='active' then current_timestamp-interval '1 day' else null end from public.licenses;
insert into public.license_terms_versions values ('20000000-0000-4000-8000-000000000001',2,2,'standard',1,'Standard',49,current_timestamp,null);
set constraints all immediate;

-- INVOKER test helper evaluates real SELECT under the caller role, not postgres.
create function pg_temp.check_access(claims text, allowed boolean, label text)
returns setof text language plpgsql security invoker as $$
begin
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', claims, true);
  return next is(public.is_licensing_owner_aal2(), allowed, label || ': helper');
  return next is((select count(*)::integer from public.licenses), case when allowed then 4 else 0 end, label || ': actual licenses SELECT');
  return next is((select count(*)::integer from public.license_terms_versions), case when allowed then 5 else 0 end, label || ': actual current and historical terms SELECT');
end;
$$;

set local role authenticated;
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","aal":"aal2"}',false,'missing singleton');
reset role;
insert into public.control_center_owner(owner_user_id) values ('00000000-0000-4000-8000-000000000031');
set local role authenticated;
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","aal":"aal2"}',true,'owner AAL2 all tenant/status/validity states');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","aal":"aal1"}',false,'owner AAL1');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000032","aal":"aal2"}',false,'non-owner AAL2');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000032","aal":"aal1"}',false,'non-owner AAL1');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031"}',false,'missing aal');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","user_metadata":{"aal":"aal2"}}',false,'fake user metadata');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","app_metadata":{"aal":"aal2"}}',false,'fake app metadata');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","amr":[{"method":"totp","aal":"aal2"}]}',false,'AMR only');
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","claims":{"aal":"aal2"}}',false,'wrong claim path');
select pg_temp.check_access(jsonb_build_object('sub','00000000-0000-4000-8000-000000000031','aal',v)::text,false,'bad aal ' || v::text)
from (values ('null'::jsonb),('true'::jsonb),('2'::jsonb),('"unknown"'::jsonb),('"AAL2"'::jsonb),('" aal2"'::jsonb),('"aal2 "'::jsonb),('["aal2"]'::jsonb),('{"value":"aal2"}'::jsonb)) cases(v);
select pg_temp.check_access(v,false,'invalid/missing request context') from (values (''),('{}'),('null'),('[]'),('"aal2"'),('{'),('{"sub":"not-a-uuid","aal":"aal2"}'),('{"aal":"aal2"}'),('{"sub":null,"aal":"aal2"}')) cases(v);

reset role;
update public.control_center_owner set owner_user_id='00000000-0000-4000-8000-000000000032';
set local role authenticated;
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","aal":"aal2"}',false,'singleton owner mismatch');
reset role;
update public.control_center_owner set owner_user_id='00000000-0000-4000-8000-000000000031';
set local role authenticated;
select * from pg_temp.check_access('{"sub":"00000000-0000-4000-8000-000000000031","aal":"aal2"}',true,'restored matching owner');

-- Even the allowed identity cannot mutate any table or read audit.
select throws_ok('insert into public.licenses default values','42501',null,'owner AAL2 cannot insert license');
select throws_ok('update public.licenses set revision=revision+1','42501',null,'owner AAL2 cannot update license');
select throws_ok('delete from public.licenses','42501',null,'owner AAL2 cannot delete license');
select throws_ok('truncate public.licenses','42501',null,'owner AAL2 cannot truncate license');
select throws_ok('insert into public.license_terms_versions default values','42501',null,'owner AAL2 cannot insert terms');
select throws_ok('update public.license_terms_versions set max_active_users=49','42501',null,'owner AAL2 cannot update terms');
select throws_ok('delete from public.license_terms_versions','42501',null,'owner AAL2 cannot delete terms');
select throws_ok('truncate public.license_terms_versions','42501',null,'owner AAL2 cannot truncate terms');
select throws_ok('select * from public.license_audit_events','42501',null,'owner AAL2 cannot read audit directly');
select throws_ok('insert into public.license_audit_events default values','42501',null,'owner AAL2 cannot insert audit');
select throws_ok('update public.license_audit_events set changed_fields=array[''id'']','42501',null,'owner AAL2 cannot update audit');
select throws_ok('delete from public.license_audit_events','42501',null,'owner AAL2 cannot delete audit');
select throws_ok('truncate public.license_audit_events','42501',null,'owner AAL2 cannot truncate audit');
reset role;
set local role anon;
select throws_ok('select public.is_licensing_owner_aal2()','42501',null,'anon cannot execute helper even with synthetic owner AAL2 claims');
select throws_ok('select * from public.licenses','42501',null,'anon cannot read licenses');
select throws_ok('select * from public.license_terms_versions','42501',null,'anon cannot read terms');
reset role;
set local role service_role;
select throws_ok('select public.is_licensing_owner_aal2()','42501',null,'service role cannot execute helper');
select throws_ok('select * from public.licenses','42501',null,'service role cannot read licenses despite BYPASSRLS');
select throws_ok('select * from public.license_terms_versions','42501',null,'service role cannot read terms despite BYPASSRLS');
reset role;
select * from finish();
rollback;
