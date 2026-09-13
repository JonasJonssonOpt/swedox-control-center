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
select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',2);
set constraints all immediate;
set constraints all deferred;
create temp table original_history as select
 (select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t) as terms,
 (select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a) as audit;
select throws_ok($q$update public.license_terms_versions set plan_key='changed'$q$,'55000','license terms versions are append-only','license_terms_versions rejects update');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$update public.license_terms_versions set plan_key=plan_key$q$,'55000','license terms versions are append-only','license_terms_versions rejects update');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$delete from public.license_terms_versions$q$,'55000','license terms versions are append-only','license_terms_versions rejects delete');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$truncate public.license_terms_versions cascade$q$,'55000','license terms versions are append-only','license_terms_versions rejects truncate');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$truncate public.licenses, public.license_terms_versions, public.license_audit_events$q$,'55000','license terms versions are append-only','license_terms_versions rejects truncate');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$update public.license_audit_events set event_type='changed'$q$,'55000','license audit events are append-only','license_audit_events rejects update');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$update public.license_audit_events set event_type=event_type$q$,'55000','license audit events are append-only','license_audit_events rejects update');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$delete from public.license_audit_events$q$,'55000','license audit events are append-only','license_audit_events rejects delete');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$truncate public.license_audit_events cascade$q$,'55000','license audit events are append-only','license_audit_events rejects truncate');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select throws_ok($q$truncate public.licenses, public.license_terms_versions, public.license_audit_events$q$,'55000','license terms versions are append-only','license_audit_events rejects truncate');
select is((select jsonb_agg(to_jsonb(t) order by license_id,version) from public.license_terms_versions t),(select terms from original_history),'terms unchanged');
select is((select jsonb_agg(to_jsonb(a) order by license_id,revision_after) from public.license_audit_events a),(select audit from original_history),'audit unchanged');
select lives_ok('update public.license_terms_versions set plan_key=plan_key where false','zero-row update does not change history');
select * from finish();
rollback;
