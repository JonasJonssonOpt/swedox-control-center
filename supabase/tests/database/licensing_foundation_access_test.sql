begin;
select no_plan();
insert into public.tenants(id, category, legal_name, created_by, updated_by)
values ('10000000-0000-4000-8000-000000000001','internal','Licensing Foundation Test',
'10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099'),
('10000000-0000-4000-8000-000000000002','internal','Licensing Other Tenant',
'10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099');
insert into public.licenses(id,tenant_id,created_by,updated_by)
select ('20000000-0000-4000-8000-00000000000' || n)::uuid,
('10000000-0000-4000-8000-00000000000' || n)::uuid,
'10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099'
from generate_series(1,2) n;
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields)
select id,'license_created',created_by,1,array['id','tenant_id','status','revision'] from public.licenses
where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
insert into public.license_terms_versions
select id,1,1,'mini',1,'Mini',24,'2026-01-01'::timestamptz,null from public.licenses
where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
select lives_ok('set constraints all immediate','complete license/audit/terms graph satisfies deferred FKs');
set constraints all deferred;

-- Test-only subtransaction: always roll back the attempted change, including success.
create function pg_temp.attempt(statement text) returns text language plpgsql as $$
begin
  begin
    execute statement;
    set constraints all immediate;
    raise exception using errcode = 'ZX001', message = 'test success rollback';
  exception
    when sqlstate 'ZX001' then return '00000';
    when others then return sqlstate;
  end;
end;
$$;
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.licenses'::regclass),'licenses RLS and FORCE');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='licenses'),1,'licenses one F2D3 read policy');
select is((select count(*)::integer from pg_trigger where tgrelid='public.licenses'::regclass and not tgisinternal),0,'licenses no product triggers');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('public','public.licenses',p)),0,'public no licenses privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('anon','public.licenses',p)),0,'anon no licenses privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('authenticated','public.licenses',p)),1,'authenticated only SELECT licenses');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('service_role','public.licenses',p)),0,'service_role no licenses privileges');
select is((select count(*)::integer from pg_attribute where attrelid='public.licenses'::regclass and attnum>0 and attacl is not null),0,'licenses no column ACL');
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.licenses'::regclass and a.grantee<>c.relowner and not (a.grantee='authenticated'::regrole and a.privilege_type='SELECT' and not a.is_grantable)),0,'licenses only authenticated SELECT ACL without grant option');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.license_terms_versions'::regclass),'license_terms_versions RLS and FORCE');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='license_terms_versions'),1,'license_terms_versions one F2D3 read policy');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_terms_versions'::regclass and not tgisinternal),0,'license_terms_versions no product triggers');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('public','public.license_terms_versions',p)),0,'public no license_terms_versions privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('anon','public.license_terms_versions',p)),0,'anon no license_terms_versions privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('authenticated','public.license_terms_versions',p)),1,'authenticated only SELECT license_terms_versions');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('service_role','public.license_terms_versions',p)),0,'service_role no license_terms_versions privileges');
select is((select count(*)::integer from pg_attribute where attrelid='public.license_terms_versions'::regclass and attnum>0 and attacl is not null),0,'license_terms_versions no column ACL');
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.license_terms_versions'::regclass and a.grantee<>c.relowner and not (a.grantee='authenticated'::regrole and a.privilege_type='SELECT' and not a.is_grantable)),0,'license_terms_versions only authenticated SELECT ACL without grant option');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.license_audit_events'::regclass),'license_audit_events RLS and FORCE');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='license_audit_events'),0,'license_audit_events zero policies');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_audit_events'::regclass and not tgisinternal),0,'license_audit_events no product triggers');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('public','public.license_audit_events',p)),0,'public no license_audit_events privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('anon','public.license_audit_events',p)),0,'anon no license_audit_events privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('authenticated','public.license_audit_events',p)),0,'authenticated no license_audit_events privileges');
select is((select count(*)::integer from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p where has_table_privilege('service_role','public.license_audit_events',p)),0,'service_role no license_audit_events privileges');
select is((select count(*)::integer from pg_attribute where attrelid='public.license_audit_events'::regclass and attnum>0 and attacl is not null),0,'license_audit_events no column ACL');
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.license_audit_events'::regclass and a.grantee<>c.relowner),0,'license_audit_events no nonowner ACL or grant options');
select ok((select contype='f' and confrelid='public.tenants'::regclass and conkey='{2}'::smallint[] and confkey='{1}'::smallint[] and condeferrable=false and condeferred=false and confdeltype='r' and confupdtype='a' and convalidated from pg_constraint where conrelid='public.licenses'::regclass and conname='fk_licenses_tenant_id'),'fk_licenses_tenant_id exact FK');
select ok((select contype='f' and confrelid='public.license_terms_versions'::regclass and conkey='{1,5}'::smallint[] and confkey='{1,2}'::smallint[] and condeferrable=true and condeferred=true and confdeltype='a' and confupdtype='a' and convalidated from pg_constraint where conrelid='public.licenses'::regclass and conname='fk_licenses_current_terms'),'fk_licenses_current_terms exact FK');
select ok((select contype='f' and confrelid='public.licenses'::regclass and conkey='{1}'::smallint[] and confkey='{1}'::smallint[] and condeferrable=false and condeferred=false and confdeltype='r' and confupdtype='a' and convalidated from pg_constraint where conrelid='public.license_terms_versions'::regclass and conname='fk_license_terms_versions_license_id'),'fk_license_terms_versions_license_id exact FK');
select ok((select contype='f' and confrelid='public.license_audit_events'::regclass and conkey='{1,3}'::smallint[] and confkey='{2,7}'::smallint[] and condeferrable=true and condeferred=true and confdeltype='a' and confupdtype='a' and convalidated from pg_constraint where conrelid='public.license_terms_versions'::regclass and conname='fk_license_terms_versions_audit_revision'),'fk_license_terms_versions_audit_revision exact FK');
select ok((select contype='f' and confrelid='public.licenses'::regclass and conkey='{2}'::smallint[] and confkey='{1}'::smallint[] and condeferrable=false and condeferred=false and confdeltype='r' and confupdtype='a' and convalidated from pg_constraint where conrelid='public.license_audit_events'::regclass and conname='fk_license_audit_events_license_id'),'fk_license_audit_events_license_id exact FK');
select ok((select contype='p' and conkey='{1}'::smallint[] and not condeferrable from pg_constraint where conrelid='public.licenses'::regclass and conname='pk_licenses'),'pk_licenses exact nondeferred key');
select ok((select contype='p' and conkey='{1,2}'::smallint[] and not condeferrable from pg_constraint where conrelid='public.license_terms_versions'::regclass and conname='pk_license_terms_versions'),'pk_license_terms_versions exact nondeferred key');
select ok((select contype='u' and conkey='{1,3}'::smallint[] and not condeferrable from pg_constraint where conrelid='public.license_terms_versions'::regclass and conname='uq_license_terms_versions_license_revision'),'uq_license_terms_versions_license_revision exact nondeferred key');
select ok((select contype='p' and conkey='{1}'::smallint[] and not condeferrable from pg_constraint where conrelid='public.license_audit_events'::regclass and conname='pk_license_audit_events'),'pk_license_audit_events exact nondeferred key');
select ok((select contype='u' and conkey='{2,7}'::smallint[] and not condeferrable from pg_constraint where conrelid='public.license_audit_events'::regclass and conname='uq_license_audit_events_license_revision'),'uq_license_audit_events_license_revision exact nondeferred key');
select set_eq($q$select conname::text from pg_constraint where conrelid='public.licenses'::regclass and contype='c'$q$,$q$values ('ck_licenses_status'),('ck_licenses_revision'),('ck_licenses_current_terms_version'),('ck_licenses_timestamps')$q$,'licenses exact checks');
select is((select count(*)::integer from pg_constraint where conrelid='public.licenses'::regclass and contype='f'),2,'licenses no extra FK including Auth');
select set_eq($q$select conname::text from pg_constraint where conrelid='public.license_terms_versions'::regclass and contype='c'$q$,$q$values ('ck_license_terms_versions_versions'),('ck_license_terms_versions_plan_version'),('ck_license_terms_versions_max_active_users'),('ck_license_terms_versions_plan_snapshot'),('ck_license_terms_versions_validity')$q$,'license_terms_versions exact checks');
select is((select count(*)::integer from pg_constraint where conrelid='public.license_terms_versions'::regclass and contype='f'),2,'license_terms_versions no extra FK including Auth');
select set_eq($q$select conname::text from pg_constraint where conrelid='public.license_audit_events'::regclass and contype='c'$q$,$q$values ('ck_license_audit_events_event_type'),('ck_license_audit_events_revisions'),('ck_license_audit_events_occurred_at'),('ck_license_audit_events_changed_fields')$q$,'license_audit_events exact checks');
select is((select count(*)::integer from pg_constraint where conrelid='public.license_audit_events'::regclass and contype='f'),1,'license_audit_events no extra FK including Auth');
select is(pg_get_indexdef('public.idx_licenses_tenant_non_terminated_unique'::regclass),$q$CREATE UNIQUE INDEX idx_licenses_tenant_non_terminated_unique ON public.licenses USING btree (tenant_id) WHERE (status <> 'terminated'::text)$q$,'idx_licenses_tenant_non_terminated_unique exact index');
select is(pg_get_indexdef('public.idx_licenses_tenant_id'::regclass),$q$CREATE INDEX idx_licenses_tenant_id ON public.licenses USING btree (tenant_id)$q$,'idx_licenses_tenant_id exact index');
select is(pg_get_indexdef('public.idx_licenses_created_at_id'::regclass),$q$CREATE INDEX idx_licenses_created_at_id ON public.licenses USING btree (created_at DESC, id DESC)$q$,'idx_licenses_created_at_id exact index');
select is(pg_get_indexdef('public.idx_license_audit_events_license_occurred'::regclass),$q$CREATE INDEX idx_license_audit_events_license_occurred ON public.license_audit_events USING btree (license_id, occurred_at DESC, id DESC)$q$,'idx_license_audit_events_license_occurred exact index');
select is((select count(*)::integer from pg_index where indrelid='public.licenses'::regclass),4,'licenses exact index count');
select is((select count(*)::integer from pg_index where indrelid='public.license_terms_versions'::regclass),2,'license_terms_versions exact index count');
select is((select count(*)::integer from pg_index where indrelid='public.license_audit_events'::regclass),3,'license_audit_events exact index count');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and (proname like '%license%' or proname like '%licensing%')),1,'only F2D3 Licensing authorization helper; no read or write RPC');
set local role anon;
select throws_ok($q$select * from public.licenses$q$,'42501',null,'anon denied select licenses');
select throws_ok($q$insert into public.licenses default values$q$,'42501',null,'anon denied insert licenses');
select throws_ok($q$update public.licenses set status=status$q$,'42501',null,'anon denied update licenses');
select throws_ok($q$delete from public.licenses$q$,'42501',null,'anon denied delete licenses');
select throws_ok($q$truncate public.licenses$q$,'42501',null,'anon denied truncate licenses');
select throws_ok($q$select * from public.license_terms_versions$q$,'42501',null,'anon denied select license_terms_versions');
select throws_ok($q$insert into public.license_terms_versions default values$q$,'42501',null,'anon denied insert license_terms_versions');
select throws_ok($q$update public.license_terms_versions set version=version$q$,'42501',null,'anon denied update license_terms_versions');
select throws_ok($q$delete from public.license_terms_versions$q$,'42501',null,'anon denied delete license_terms_versions');
select throws_ok($q$truncate public.license_terms_versions$q$,'42501',null,'anon denied truncate license_terms_versions');
select throws_ok($q$select * from public.license_audit_events$q$,'42501',null,'anon denied select license_audit_events');
select throws_ok($q$insert into public.license_audit_events default values$q$,'42501',null,'anon denied insert license_audit_events');
select throws_ok($q$update public.license_audit_events set event_type=event_type$q$,'42501',null,'anon denied update license_audit_events');
select throws_ok($q$delete from public.license_audit_events$q$,'42501',null,'anon denied delete license_audit_events');
select throws_ok($q$truncate public.license_audit_events$q$,'42501',null,'anon denied truncate license_audit_events');
reset role;
set local role authenticated;
select is((select count(*)::integer from public.licenses),0,'authenticated without identity sees no licenses');
select throws_ok($q$insert into public.licenses default values$q$,'42501',null,'authenticated denied insert licenses');
select throws_ok($q$update public.licenses set status=status$q$,'42501',null,'authenticated denied update licenses');
select throws_ok($q$delete from public.licenses$q$,'42501',null,'authenticated denied delete licenses');
select throws_ok($q$truncate public.licenses$q$,'42501',null,'authenticated denied truncate licenses');
select is((select count(*)::integer from public.license_terms_versions),0,'authenticated without identity sees no license_terms_versions');
select throws_ok($q$insert into public.license_terms_versions default values$q$,'42501',null,'authenticated denied insert license_terms_versions');
select throws_ok($q$update public.license_terms_versions set version=version$q$,'42501',null,'authenticated denied update license_terms_versions');
select throws_ok($q$delete from public.license_terms_versions$q$,'42501',null,'authenticated denied delete license_terms_versions');
select throws_ok($q$truncate public.license_terms_versions$q$,'42501',null,'authenticated denied truncate license_terms_versions');
select throws_ok($q$select * from public.license_audit_events$q$,'42501',null,'authenticated denied select license_audit_events');
select throws_ok($q$insert into public.license_audit_events default values$q$,'42501',null,'authenticated denied insert license_audit_events');
select throws_ok($q$update public.license_audit_events set event_type=event_type$q$,'42501',null,'authenticated denied update license_audit_events');
select throws_ok($q$delete from public.license_audit_events$q$,'42501',null,'authenticated denied delete license_audit_events');
select throws_ok($q$truncate public.license_audit_events$q$,'42501',null,'authenticated denied truncate license_audit_events');
reset role;
set local role service_role;
select throws_ok($q$select * from public.licenses$q$,'42501',null,'service_role denied select licenses');
select throws_ok($q$insert into public.licenses default values$q$,'42501',null,'service_role denied insert licenses');
select throws_ok($q$update public.licenses set status=status$q$,'42501',null,'service_role denied update licenses');
select throws_ok($q$delete from public.licenses$q$,'42501',null,'service_role denied delete licenses');
select throws_ok($q$truncate public.licenses$q$,'42501',null,'service_role denied truncate licenses');
select throws_ok($q$select * from public.license_terms_versions$q$,'42501',null,'service_role denied select license_terms_versions');
select throws_ok($q$insert into public.license_terms_versions default values$q$,'42501',null,'service_role denied insert license_terms_versions');
select throws_ok($q$update public.license_terms_versions set version=version$q$,'42501',null,'service_role denied update license_terms_versions');
select throws_ok($q$delete from public.license_terms_versions$q$,'42501',null,'service_role denied delete license_terms_versions');
select throws_ok($q$truncate public.license_terms_versions$q$,'42501',null,'service_role denied truncate license_terms_versions');
select throws_ok($q$select * from public.license_audit_events$q$,'42501',null,'service_role denied select license_audit_events');
select throws_ok($q$insert into public.license_audit_events default values$q$,'42501',null,'service_role denied insert license_audit_events');
select throws_ok($q$update public.license_audit_events set event_type=event_type$q$,'42501',null,'service_role denied update license_audit_events');
select throws_ok($q$delete from public.license_audit_events$q$,'42501',null,'service_role denied delete license_audit_events');
select throws_ok($q$truncate public.license_audit_events$q$,'42501',null,'service_role denied truncate license_audit_events');
reset role;
select * from finish();
rollback;

