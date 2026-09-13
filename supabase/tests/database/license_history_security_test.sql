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


create function pg_temp.append_event(l uuid, r bigint, e text, v bigint default null) returns void language plpgsql as $$
begin
  insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields)
    values (l,e,'10000000-0000-4000-8000-000000000099',r-1,r,array['revision']);
  if v is not null then
    insert into public.license_terms_versions values(l,v,r,'mini',1,'Mini',24,'2026-01-01',null);
  end if;
  update public.licenses set revision=r,current_terms_version=coalesce(v,current_terms_version) where id=l;
end;
$$;
create function pg_temp.attempt(statement text) returns text language plpgsql as $$
begin
  begin
    execute statement;
    set constraints all immediate;
    raise exception using errcode='ZX001',message='test rollback';
  exception when sqlstate 'ZX001' then return '00000'; when others then return sqlstate;
  end;
end;
$$;
select has_function('public','prevent_license_terms_version_modification',array[]::text[],'prevent_license_terms_version_modification exists');
select function_returns('public','prevent_license_terms_version_modification',array[]::text[],'trigger','prevent_license_terms_version_modification is trigger only');
select ok(prosecdef=false and provolatile='v' and proparallel='u' and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog'] and pronargs=0,'prevent_license_terms_version_modification exact security properties') from pg_proc where oid='public.prevent_license_terms_version_modification()'::regprocedure;
select ok(not has_function_privilege(r,'public.prevent_license_terms_version_modification()','EXECUTE'),r || ' no direct prevent_license_terms_version_modification') from unnest(array['public','anon','authenticated','service_role']) r;
select has_function('public','prevent_license_audit_event_modification',array[]::text[],'prevent_license_audit_event_modification exists');
select function_returns('public','prevent_license_audit_event_modification',array[]::text[],'trigger','prevent_license_audit_event_modification is trigger only');
select ok(prosecdef=false and provolatile='v' and proparallel='u' and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog'] and pronargs=0,'prevent_license_audit_event_modification exact security properties') from pg_proc where oid='public.prevent_license_audit_event_modification()'::regprocedure;
select ok(not has_function_privilege(r,'public.prevent_license_audit_event_modification()','EXECUTE'),r || ' no direct prevent_license_audit_event_modification') from unnest(array['public','anon','authenticated','service_role']) r;
select has_function('public','enforce_license_history_integrity',array[]::text[],'enforce_license_history_integrity exists');
select function_returns('public','enforce_license_history_integrity',array[]::text[],'trigger','enforce_license_history_integrity is trigger only');
select ok(prosecdef=true and provolatile='v' and proparallel='u' and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog'] and pronargs=0,'enforce_license_history_integrity exact security properties') from pg_proc where oid='public.enforce_license_history_integrity()'::regprocedure;
select ok(not has_function_privilege(r,'public.enforce_license_history_integrity()','EXECUTE'),r || ' no direct enforce_license_history_integrity') from unnest(array['public','anon','authenticated','service_role']) r;
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_terms_versions'::regclass and tgname='trg_license_terms_versions_append_only' and tgtype=27 and tgenabled='O' and tgdeferrable=false and tginitdeferred=false and (tgconstraint<>0)=false and tgfoid='public.prevent_license_terms_version_modification()'::regprocedure and not tgisinternal),1,'trg_license_terms_versions_append_only exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_terms_versions'::regclass and tgname='trg_license_terms_versions_prevent_truncate' and tgtype=34 and tgenabled='O' and tgdeferrable=false and tginitdeferred=false and (tgconstraint<>0)=false and tgfoid='public.prevent_license_terms_version_modification()'::regprocedure and not tgisinternal),1,'trg_license_terms_versions_prevent_truncate exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_audit_events'::regclass and tgname='trg_license_audit_events_append_only' and tgtype=27 and tgenabled='O' and tgdeferrable=false and tginitdeferred=false and (tgconstraint<>0)=false and tgfoid='public.prevent_license_audit_event_modification()'::regprocedure and not tgisinternal),1,'trg_license_audit_events_append_only exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_audit_events'::regclass and tgname='trg_license_audit_events_prevent_truncate' and tgtype=34 and tgenabled='O' and tgdeferrable=false and tginitdeferred=false and (tgconstraint<>0)=false and tgfoid='public.prevent_license_audit_event_modification()'::regprocedure and not tgisinternal),1,'trg_license_audit_events_prevent_truncate exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.licenses'::regclass and tgname='trg_licenses_history_integrity' and tgtype=21 and tgenabled='O' and tgdeferrable=true and tginitdeferred=true and (tgconstraint<>0)=true and tgfoid='public.enforce_license_history_integrity()'::regprocedure and not tgisinternal),1,'trg_licenses_history_integrity exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_terms_versions'::regclass and tgname='trg_license_terms_versions_history_integrity' and tgtype=5 and tgenabled='O' and tgdeferrable=true and tginitdeferred=true and (tgconstraint<>0)=true and tgfoid='public.enforce_license_history_integrity()'::regprocedure and not tgisinternal),1,'trg_license_terms_versions_history_integrity exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid='public.license_audit_events'::regclass and tgname='trg_license_audit_events_history_integrity' and tgtype=5 and tgenabled='O' and tgdeferrable=true and tginitdeferred=true and (tgconstraint<>0)=true and tgfoid='public.enforce_license_history_integrity()'::regprocedure and not tgisinternal),1,'trg_license_audit_events_history_integrity exact event/timing/role/constraint metadata');
select is((select count(*)::integer from pg_trigger where tgrelid in ('public.licenses'::regclass,'public.license_terms_versions'::regclass,'public.license_audit_events'::regclass) and not tgisinternal),7,'exactly seven structural triggers');
-- Fixed test-only definer simulates a future writer; no permanent RPC or grants.
create function pg_temp.test_definer_writer(bad boolean) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields)
    values ('20000000-0000-4000-8000-000000000001','license_activated','10000000-0000-4000-8000-000000000099',1,2,array['revision']);
  if not bad then update public.licenses set revision=2 where id='20000000-0000-4000-8000-000000000001'; end if;
end;
$$;
create function pg_temp.test_definer_update() returns void language sql security definer set search_path=pg_catalog as $$
  update public.license_terms_versions set plan_key=plan_key;
$$;
set local role authenticated;
select throws_ok('select pg_temp.test_definer_writer(true);set constraints all immediate','23514','license history integrity violation','deferred validator sees closed audit after returning from definer');
select lives_ok('select pg_temp.test_definer_writer(false);set constraints all immediate','valid definer write works without caller EXECUTE on trigger functions');
select throws_ok('select pg_temp.test_definer_update()','55000','license terms versions are append-only','definer cannot bypass immutable history');
select throws_ok('select * from public.license_audit_events','42501',null,'audit still closed');
reset role;
create temp table wrong_history_context(id uuid);
create constraint trigger wrong_history_context_trigger
after insert on wrong_history_context deferrable initially deferred
for each row execute function public.enforce_license_history_integrity();
select throws_ok('insert into wrong_history_context values(gen_random_uuid());set constraints all immediate','23514','license history integrity violation','validator rejects attachment to any non-Licensing table');
select * from finish();
rollback;
