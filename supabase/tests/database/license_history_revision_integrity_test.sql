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
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_activated')$q$),'00000','lifecycle without terms');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',2)$q$),'00000','terms event');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_renewed',2)$q$),'00000','renewal structure');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_activated');select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_terms_changed',2);select pg_temp.append_event('20000000-0000-4000-8000-000000000001',4,'license_suspended')$q$),'00000','queued NEW revisions need not match final state');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$update public.licenses set revision=2 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','license ahead');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_activated','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'23514','standalone future audit');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_activated')$q$),'23514','audit gap');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_activated');select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_terms_changed',3)$q$),'23514','terms gap');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',2);update public.licenses set current_terms_version=1 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','stale current pointer');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',3);select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_terms_changed',2)$q$),'23514','invalid order also locally constrained');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_activated');select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_terms_changed',3);select pg_temp.append_event('20000000-0000-4000-8000-000000000001',4,'license_terms_changed',2);update public.licenses set current_terms_version=3 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','introduced revisions decrease across valid local versions');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_activated',2)$q$),'23514','terms on lifecycle event');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed')$q$),'23514','terms missing for change');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_renewed')$q$),'23514','terms missing for renewal');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',3,'license_terms_changed',3);select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',2);update public.licenses set revision=3,current_terms_version=3 where id='20000000-0000-4000-8000-000000000001'$q$),'00000','out-of-order insert within complete final transaction');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',2,'license_terms_changed',2);update public.licenses set revision=1,current_terms_version=1 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','cannot move license behind history');
select is((select revision from public.licenses where id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back license');
select is((select count(*) from public.license_audit_events where license_id='20000000-0000-4000-8000-000000000001'),1::bigint,'attempt rolled back audit');
select throws_ok($q$insert into public.license_terms_versions values('20000000-0000-4000-8000-000000000001',2,2,'mini',1,'Mini',24,'2026-01-01',null);set constraints fk_license_terms_versions_audit_revision immediate$q$,'23503',null,'standalone terms missing deferred audit FK');
select throws_ok($q$update public.licenses set revision=2,current_terms_version=2 where id='20000000-0000-4000-8000-000000000001';set constraints fk_licenses_current_terms immediate$q$,'23503',null,'missing current terms FK');
select throws_ok($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000002',2,'license_terms_changed',2);update public.licenses set revision=2,current_terms_version=2 where id='20000000-0000-4000-8000-000000000001';set constraints fk_licenses_current_terms immediate$q$,'23503',null,'other license terms cannot satisfy current pointer');
select throws_ok($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000002',2,'license_terms_changed',2);insert into public.license_terms_versions values('20000000-0000-4000-8000-000000000001',2,2,'mini',1,'Mini',24,'2026-01-01',null);set constraints fk_license_terms_versions_audit_revision immediate$q$,'23503',null,'other license audit cannot satisfy introduction FK');
-- No upper-bound sequence allocation; realistic longer history verifies count/max.
select is(pg_temp.attempt($q$select pg_temp.append_event('20000000-0000-4000-8000-000000000001',r,'license_activated') from generate_series(2,101) r$q$),'00000','100 complete queued revisions');
set constraints all immediate;
select * from finish();
rollback;
