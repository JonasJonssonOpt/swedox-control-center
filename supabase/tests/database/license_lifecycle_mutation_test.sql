begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);
create function pg_temp.t(n integer) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
-- Latest license for a Tenant, including terminated history.
create function pg_temp.lic(n integer) returns uuid language sql stable as $$
  select id from public.licenses where tenant_id=pg_temp.t(n) order by created_at desc, id desc limit 1
$$;
insert into public.tenants(id,category,legal_name,created_by,updated_by)
select pg_temp.t(n),'internal','Lifecycle test '||n,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051' from generate_series(1,20) n;
-- Ended-interval fixtures cannot be created by create_license (no backdating).
insert into public.licenses(id,tenant_id,status,created_by,updated_by) values
('20000000-0000-4000-8000-000000000009',pg_temp.t(9),'draft','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
('20000000-0000-4000-8000-000000000010',pg_temp.t(10),'suspended','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields)
select id,'license_created',created_by,1,array['id','tenant_id','status','revision'] from public.licenses;
insert into public.license_terms_versions
select id,1,1,'mini',1,'Mini',24,'2020-01-01'::timestamptz,'2021-01-01'::timestamptz from public.licenses;
select lives_ok('set constraints all immediate','expired fixtures are structurally valid');
set constraints all deferred;

set local role authenticated;
select lives_ok($q$select public.create_license(pg_temp.t(n),'mini') from generate_series(1,8) n;set constraints all immediate$q$,'draft fixtures created');
set constraints all deferred;
select lives_ok($q$select public.create_license(pg_temp.t(11),'standard',clock_timestamp()+interval '1 day');set constraints all immediate$q$,'future-start draft created');
set constraints all deferred;

-- Full lifecycle on Tenant 1: activate -> suspend -> reactivate -> terminate.
select lives_ok($q$select public.activate_license(pg_temp.lic(1),1,'00000000-0000-4000-8000-000000000099');set constraints all immediate$q$,'activate draft');
set constraints all deferred;
select results_eq($q$select status,revision,current_terms_version from public.licenses where id=pg_temp.lic(1)$q$,$q$values ('active'::text,2::bigint,1::bigint)$q$,'activated at revision 2 with unchanged terms');
select lives_ok($q$select public.suspend_license(pg_temp.lic(1),2);set constraints all immediate$q$,'suspend active');
set constraints all deferred;
select results_eq($q$select status,revision from public.licenses where id=pg_temp.lic(1)$q$,$q$values ('suspended'::text,3::bigint)$q$,'suspended at revision 3');
select lives_ok($q$select public.activate_license(pg_temp.lic(1),3);set constraints all immediate$q$,'reactivate suspended');
set constraints all deferred;
select results_eq($q$select status,revision from public.licenses where id=pg_temp.lic(1)$q$,$q$values ('active'::text,4::bigint)$q$,'reactivated at revision 4');
select lives_ok($q$select public.terminate_license(pg_temp.lic(1),4);set constraints all immediate$q$,'terminate active');
set constraints all deferred;
select results_eq($q$select status,revision,current_terms_version from public.licenses where id=pg_temp.lic(1)$q$,$q$values ('terminated'::text,5::bigint,1::bigint)$q$,'terminated at revision 5');
reset role;
select results_eq(
  $q$select event_type,revision_before,revision_after from public.license_audit_events where license_id=pg_temp.lic(1) order by revision_after$q$,
  $q$values ('license_created'::text,null::bigint,1::bigint),('license_activated',1,2),('license_suspended',2,3),('license_activated',3,4),('license_terminated',4,5)$q$,
  'exact contiguous audit chain; reactivation uses license_activated');
select ok(bool_and(a.changed_fields=array['status','revision','updated_at','updated_by']::text[] and a.actor_user_id='00000000-0000-4000-8000-000000000051'),'lifecycle changed_fields and DB-bound actor')
from public.license_audit_events a where a.license_id=pg_temp.lic(1) and a.event_type<>'license_created';
select is((select correlation_id from public.license_audit_events where license_id=pg_temp.lic(1) and revision_after=2),'00000000-0000-4000-8000-000000000099'::uuid,'correlation stored');
select is((select correlation_id from public.license_audit_events where license_id=pg_temp.lic(1) and revision_after=3),null::uuid,'default correlation null');
select ok(l.updated_at=a.occurred_at and l.updated_by='00000000-0000-4000-8000-000000000051' and l.updated_at>l.created_at,'updated_at equals latest decision time')
from public.licenses l join public.license_audit_events a on a.license_id=l.id and a.revision_after=l.revision where l.id=pg_temp.lic(1);
select ok(bool_and(a.occurred_at>=b.occurred_at),'decision times are non-decreasing')
from public.license_audit_events a join public.license_audit_events b on b.license_id=a.license_id and b.revision_after=a.revision_after-1 where a.license_id=pg_temp.lic(1);
select is((select count(*)::integer from public.license_terms_versions where license_id=pg_temp.lic(1)),1,'lifecycle creates no terms versions');
set local role authenticated;

-- Draft and suspended can be terminated.
select lives_ok($q$select public.terminate_license(pg_temp.lic(2),1);set constraints all immediate$q$,'terminate draft');
set constraints all deferred;
select lives_ok($q$select public.activate_license(pg_temp.lic(3),1);select public.suspend_license(pg_temp.lic(3),2);select public.terminate_license(pg_temp.lic(3),3);set constraints all immediate$q$,'terminate suspended');
set constraints all deferred;
select results_eq($q$select status,revision from public.licenses where tenant_id in (pg_temp.t(2),pg_temp.t(3)) order by tenant_id$q$,$q$values ('terminated'::text,2::bigint),('terminated',4)$q$,'draft and suspended terminated');

-- Terminated frees the Tenant for a new draft and keeps history.
select lives_ok($q$select public.create_license(pg_temp.t(2),'stor');set constraints all immediate$q$,'new draft after termination');
set constraints all deferred;
select is((select count(*)::integer from public.licenses where tenant_id=pg_temp.t(2)),2,'terminated history retained');

-- Invalid transitions, including repeated status and terminal state.
select lives_ok($q$select public.activate_license(pg_temp.lic(4),1);set constraints all immediate$q$,'activate Tenant 4');
set constraints all deferred;
select throws_ok($q$select public.activate_license(pg_temp.lic(4),2)$q$,'P0001','invalid_state_transition','active cannot be activated again');
select throws_ok($q$select public.suspend_license(pg_temp.lic(5),1)$q$,'P0001','invalid_state_transition','draft cannot be suspended');
select lives_ok($q$select public.suspend_license(pg_temp.lic(4),2);set constraints all immediate$q$,'suspend Tenant 4');
set constraints all deferred;
select throws_ok($q$select public.suspend_license(pg_temp.lic(4),3)$q$,'P0001','invalid_state_transition','suspended cannot be suspended again');
select throws_ok($q$select public.activate_license(pg_temp.lic(1),5)$q$,'P0001','invalid_state_transition','terminated cannot be activated');
select throws_ok($q$select public.suspend_license(pg_temp.lic(1),5)$q$,'P0001','invalid_state_transition','terminated cannot be suspended');
select throws_ok($q$select public.terminate_license(pg_temp.lic(1),5)$q$,'P0001','invalid_state_transition','terminated cannot be terminated again');

-- Stale revision is a conflict and is evaluated before state.
select throws_ok($q$select public.activate_license(pg_temp.lic(5),2)$q$,'P0001','conflict','future revision conflicts');
select throws_ok($q$select public.suspend_license(pg_temp.lic(4),2)$q$,'P0001','conflict','stale revision conflicts');
select throws_ok($q$select public.terminate_license(pg_temp.lic(1),4)$q$,'P0001','conflict','stale revision on terminated license is conflict, not state');

-- Input validation and missing license.
select throws_ok($q$select public.activate_license(null,1)$q$,'22023','validation_error','activate null id');
select throws_ok($q$select public.suspend_license(pg_temp.lic(4),null)$q$,'22023','validation_error','suspend null revision');
select throws_ok($q$select public.terminate_license(pg_temp.lic(4),0)$q$,'22023','validation_error','terminate zero revision');
select throws_ok($q$select public.activate_license(pg_temp.lic(4),-1)$q$,'22023','validation_error','activate negative revision');
select throws_ok($q$select public.activate_license('20000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','activate missing license');
select throws_ok($q$select public.suspend_license('20000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','suspend missing license');
select throws_ok($q$select public.terminate_license('20000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','terminate missing license');

-- Tenant availability: activation requires it; withdrawal never does.
select lives_ok($q$select public.activate_license(pg_temp.lic(7),1);set constraints all immediate$q$,'activate Tenant 7');
set constraints all deferred;
reset role;
update public.tenants set operational_status='paused' where id=pg_temp.t(6);
update public.tenants set archived_at=clock_timestamp(),archived_by='00000000-0000-4000-8000-000000000051' where id=pg_temp.t(7);
set local role authenticated;
select throws_ok($q$select public.activate_license(pg_temp.lic(6),1)$q$,'P0001','tenant_not_available','paused Tenant blocks activation');
select lives_ok($q$select public.suspend_license(pg_temp.lic(7),2);set constraints all immediate$q$,'archived Tenant does not block suspend');
set constraints all deferred;
select throws_ok($q$select public.activate_license(pg_temp.lic(7),3)$q$,'P0001','tenant_not_available','archived Tenant blocks reactivation');
select lives_ok($q$select public.terminate_license(pg_temp.lic(6),1);set constraints all immediate$q$,'paused Tenant does not block terminate');
set constraints all deferred;
select lives_ok($q$select public.terminate_license(pg_temp.lic(7),3);set constraints all immediate$q$,'archived Tenant does not block terminate');
set constraints all deferred;

-- Validity: ended interval blocks activation; future start does not.
select throws_ok($q$select public.activate_license(pg_temp.lic(9),1)$q$,'P0001','invalid_state_transition','ended draft cannot be activated');
select throws_ok($q$select public.activate_license(pg_temp.lic(10),1)$q$,'P0001','invalid_state_transition','ended suspended cannot be reactivated');
select lives_ok($q$select public.terminate_license(pg_temp.lic(10),1);set constraints all immediate$q$,'ended license can be terminated');
set constraints all deferred;
select lives_ok($q$select public.activate_license(pg_temp.lic(11),1);set constraints all immediate$q$,'future start can be activated (not_started)');
set constraints all deferred;
reset role;

-- Rejections write nothing.
select results_eq($q$select status,revision from public.licenses where tenant_id in (pg_temp.t(4),pg_temp.t(5),pg_temp.t(9)) order by tenant_id$q$,
  $q$values ('suspended'::text,3::bigint),('draft',1),('draft',1)$q$,'rejected requests leave license state unchanged');
select ok(bool_and(l.revision=(select count(*) from public.license_audit_events a where a.license_id=l.id)),'audit count equals revision for every license') from public.licenses l;
select is((select count(*)::integer from public.license_terms_versions),(select count(*)::integer from public.licenses),'only creates introduce terms');

-- Audit failure rolls back the whole mutation (transaction-scoped probe).
set local role authenticated;
select lives_ok($q$select public.activate_license(pg_temp.lic(8),1);set constraints all immediate$q$,'activate Tenant 8');
set constraints all deferred;
reset role;
alter table public.license_audit_events add constraint test_reject_suspend check(event_type<>'license_suspended') not valid;
set local role authenticated;
select throws_ok($q$select public.suspend_license(pg_temp.lic(8),2)$q$,'P0001','audit_failure','audit failure rejects suspend');
reset role;
alter table public.license_audit_events drop constraint test_reject_suspend;
select results_eq($q$select status,revision from public.licenses where id=pg_temp.lic(8)$q$,$q$values ('active'::text,2::bigint)$q$,'audit failure leaves no partial license change');
select throws_ok($q$select public.terminate_license(pg_temp.lic(8),2);update public.licenses set revision=4 where id=pg_temp.lic(8);set constraints all immediate$q$,'23514','license history integrity violation','deferred integrity failure rolls back attempted lifecycle transaction');
select results_eq($q$select status,revision from public.licenses where id=pg_temp.lic(8)$q$,$q$values ('active'::text,2::bigint)$q$,'no partial terminate after deferred failure');
select lives_ok('set constraints all immediate','remaining graph valid');
select * from finish();
rollback;
