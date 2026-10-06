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
create function pg_temp.terms(n integer, v integer) returns public.license_terms_versions language sql stable as $$
  select * from public.license_terms_versions where license_id=pg_temp.lic(n) and version=v
$$;
insert into public.tenants(id,category,legal_name,created_by,updated_by)
select pg_temp.t(n),'internal','Terms test '||n,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051' from generate_series(1,20) n;
-- Ended-interval fixtures cannot be created by create_license (no backdating).
insert into public.licenses(id,tenant_id,status,created_by,updated_by) values
('20000000-0000-4000-8000-000000000009',pg_temp.t(9),'active','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
('20000000-0000-4000-8000-000000000010',pg_temp.t(10),'suspended','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields)
select id,'license_created',created_by,1,array['id','tenant_id','status','revision'] from public.licenses;
insert into public.license_terms_versions
select id,1,1,'mini',1,'Mini',24,'2020-01-01'::timestamptz,'2021-01-01'::timestamptz from public.licenses;
select lives_ok('set constraints all immediate','ended fixtures are structurally valid');
set constraints all deferred;

set local role authenticated;
select lives_ok($q$
  select public.create_license(pg_temp.t(1),'mini');
  select public.create_license(pg_temp.t(2),'mini',null,clock_timestamp()+interval '30 days');
  select public.activate_license(pg_temp.lic(2),1);
  select public.create_license(pg_temp.t(3),'stor');
  select public.activate_license(pg_temp.lic(3),1);
  select public.suspend_license(pg_temp.lic(3),2);
  select public.create_license(pg_temp.t(4),'stor');
  select public.activate_license(pg_temp.lic(4),1);
  select public.create_license(pg_temp.t(5),'stor');
  select public.activate_license(pg_temp.lic(5),1);
  select public.create_license(pg_temp.t(6),'mini');
  select public.terminate_license(pg_temp.lic(6),1);
  select public.create_license(pg_temp.t(7),'mini',null,clock_timestamp()+interval '10 days');
  select public.activate_license(pg_temp.lic(7),1);
  select public.create_license(pg_temp.t(8),'standard',null,clock_timestamp()+interval '10 days');
  select public.activate_license(pg_temp.lic(8),1);
  select public.suspend_license(pg_temp.lic(8),2);
  select public.create_license(pg_temp.t(11),'mini',null,clock_timestamp()+interval '10 days');
  select public.create_license(pg_temp.t(12),'mini');
  select public.activate_license(pg_temp.lic(12),1);
  set constraints all immediate$q$,'fixtures created through F2D5A/F2D5B RPCs');
set constraints all deferred;

-- change_license_terms: draft replaces its whole target image under create rules.
select lives_ok($q$select public.change_license_terms(pg_temp.lic(1),1,'standard',null,null,'00000000-0000-4000-8000-000000000099');set constraints all immediate$q$,'draft plan change with default dates');
set constraints all deferred;
select results_eq($q$select status,revision,current_terms_version from public.licenses where id=pg_temp.lic(1)$q$,$q$values ('draft'::text,2::bigint,2::bigint)$q$,'draft keeps status; revision and terms version advance');
select results_eq($q$select version,introduced_at_revision,plan_key,plan_version,plan_display_label,max_active_users from public.license_terms_versions where license_id=pg_temp.lic(1) order by version$q$,
  $q$values (1::bigint,1::bigint,'mini'::text,1,'Mini'::text,24),(2,2,'standard',1,'Standard',49)$q$,'new canonical snapshot appended; version 1 preserved');
select ok((pg_temp.terms(1,2)).valid_from=l.updated_at and (pg_temp.terms(1,2)).valid_until is null,'draft default start is the decision time') from public.licenses l where l.id=pg_temp.lic(1);
select lives_ok($q$select public.change_license_terms(pg_temp.lic(1),2,'stor',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days');set constraints all immediate$q$,'draft explicit future interval');
set constraints all deferred;
select ok((pg_temp.terms(1,3)).valid_from>l.updated_at and (pg_temp.terms(1,3)).valid_until>(pg_temp.terms(1,3)).valid_from,'draft future interval stored') from public.licenses l where l.id=pg_temp.lic(1);
select throws_ok($q$select public.change_license_terms(pg_temp.lic(1),3,'stor',(pg_temp.terms(1,3)).valid_from,(pg_temp.terms(1,3)).valid_until)$q$,'22023','validation_error','unchanged draft target image');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(1),3,'mini',clock_timestamp()-interval '1 second')$q$,'22023','validation_error','draft backdated start');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(1),3,'mini','2099-01-01','2099-01-01')$q$,'22023','validation_error','draft end equals start');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(1),3,'mini',null,'infinity')$q$,'22023','validation_error','draft infinite end');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(1),3,'mini','infinity')$q$,'22023','validation_error','draft infinite start');

-- change_license_terms: active/suspended change plan only and preserve dates.
select lives_ok($q$select public.change_license_terms(pg_temp.lic(2),2,'standard');set constraints all immediate$q$,'active upgrade');
set constraints all deferred;
select ok(l.status='active' and l.revision=3 and l.current_terms_version=2
  and (pg_temp.terms(2,2)).valid_from=(pg_temp.terms(2,1)).valid_from
  and (pg_temp.terms(2,2)).valid_until=(pg_temp.terms(2,1)).valid_until
  and (pg_temp.terms(2,2)).max_active_users=49,'active plan change preserves status and dates') from public.licenses l where l.id=pg_temp.lic(2);
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'stor',clock_timestamp()+interval '1 day')$q$,'22023','validation_error','active start cannot change');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'stor',null,clock_timestamp()+interval '90 days')$q$,'22023','validation_error','active end goes through renewal');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'standard')$q$,'22023','validation_error','unchanged active plan');
select lives_ok($q$select public.change_license_terms(pg_temp.lic(3),3,'mini');set constraints all immediate$q$,'suspended downgrade');
set constraints all deferred;
select results_eq($q$select status,revision,current_terms_version from public.licenses where id=pg_temp.lic(3)$q$,$q$values ('suspended'::text,4::bigint,2::bigint)$q$,'suspended status unchanged by terms change');

-- Availability, state, conflict and input.
reset role;
update public.tenants set operational_status='paused' where id=pg_temp.t(4);
update public.tenants set archived_at=clock_timestamp(),archived_by='00000000-0000-4000-8000-000000000051' where id=pg_temp.t(5);
set local role authenticated;
select throws_ok($q$select public.change_license_terms(pg_temp.lic(4),2,'mini')$q$,'P0001','tenant_not_available','paused Tenant blocks even a downgrade');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(5),2,'mini')$q$,'P0001','tenant_not_available','archived Tenant blocks terms change');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(6),2,'stor')$q$,'P0001','invalid_state_transition','terminated terms are final');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(6),1,'stor')$q$,'P0001','conflict','stale revision is conflict before state');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),2,'stor')$q$,'P0001','conflict','stale active revision');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'Mini')$q$,'22023','validation_error','plan key is case-sensitive');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'custom')$q$,'22023','validation_error','unknown plan');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,null)$q$,'22023','validation_error','null plan');
select throws_ok($q$select public.change_license_terms(null,3,'mini')$q$,'22023','validation_error','null license');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),0,'mini')$q$,'22023','validation_error','zero revision');
select throws_ok($q$select public.change_license_terms('20000000-0000-4000-8000-0000000000ff',1,'mini')$q$,'P0001','not_found','missing license');

-- renew_license: not yet ended keeps start and moves the end forward.
select lives_ok($q$select public.renew_license(pg_temp.lic(7),2,clock_timestamp()+interval '20 days','00000000-0000-4000-8000-000000000098');set constraints all immediate$q$,'renew active before end');
set constraints all deferred;
select ok(l.status='active' and l.revision=3 and l.current_terms_version=2
  and (pg_temp.terms(7,2)).valid_from=(pg_temp.terms(7,1)).valid_from
  and (pg_temp.terms(7,2)).valid_until>(pg_temp.terms(7,1)).valid_until
  and (pg_temp.terms(7,2)).plan_key='mini' and (pg_temp.terms(7,2)).max_active_users=24,'early renewal keeps status, start and plan') from public.licenses l where l.id=pg_temp.lic(7);
select throws_ok($q$select public.renew_license(pg_temp.lic(7),3,(pg_temp.terms(7,2)).valid_until)$q$,'22023','validation_error','same end is not a renewal');
select throws_ok($q$select public.renew_license(pg_temp.lic(7),3,clock_timestamp()+interval '5 days')$q$,'22023','validation_error','renewal cannot shorten');
select lives_ok($q$select public.renew_license(pg_temp.lic(8),3,null);set constraints all immediate$q$,'renew suspended to open-ended');
set constraints all deferred;
select ok(l.status='suspended' and (pg_temp.terms(8,2)).valid_until is null and (pg_temp.terms(8,2)).plan_key='standard','suspended renewal keeps status and plan') from public.licenses l where l.id=pg_temp.lic(8);
select throws_ok($q$select public.renew_license(pg_temp.lic(8),4,clock_timestamp()+interval '1 year')$q$,'P0001','invalid_state_transition','open-ended license cannot be renewed');
select throws_ok($q$select public.renew_license(pg_temp.lic(12),2,clock_timestamp()+interval '1 year')$q$,'P0001','invalid_state_transition','default open-ended license cannot be renewed');

-- renew_license: ended interval starts a new period at the decision time.
select throws_ok($q$select public.renew_license(pg_temp.lic(10),1,'2022-01-01')$q$,'22023','validation_error','ended renewal end must be after new start');
select lives_ok($q$select public.renew_license(pg_temp.lic(9),1,'2099-01-01');set constraints all immediate$q$,'renew ended active');
set constraints all deferred;
select ok(l.status='active' and (pg_temp.terms(9,2)).valid_from=l.updated_at and (pg_temp.terms(9,2)).valid_until='2099-01-01'::timestamptz
  and (pg_temp.terms(9,1)).valid_until='2021-01-01'::timestamptz,'ended renewal restarts at decision time and keeps the gap in history') from public.licenses l where l.id=pg_temp.lic(9);
select lives_ok($q$select public.renew_license(pg_temp.lic(10),1,clock_timestamp()+interval '1 day');select public.activate_license(pg_temp.lic(10),2);set constraints all immediate$q$,'renewed ended suspended license can be reactivated');
set constraints all deferred;
select is((select status from public.licenses where id=pg_temp.lic(10)),'active','renewal then reactivation');

-- renew_license: state, availability, conflict and input.
select throws_ok($q$select public.renew_license(pg_temp.lic(11),1,clock_timestamp()+interval '1 year')$q$,'P0001','invalid_state_transition','draft uses terms change, not renewal');
select throws_ok($q$select public.renew_license(pg_temp.lic(6),2,clock_timestamp()+interval '1 year')$q$,'P0001','invalid_state_transition','terminated cannot be renewed');
select throws_ok($q$select public.renew_license(pg_temp.lic(4),2,clock_timestamp()+interval '1 year')$q$,'P0001','tenant_not_available','paused Tenant blocks renewal');
select throws_ok($q$select public.renew_license(pg_temp.lic(5),2,clock_timestamp()+interval '1 year')$q$,'P0001','tenant_not_available','archived Tenant blocks renewal');
select throws_ok($q$select public.renew_license(pg_temp.lic(7),2,clock_timestamp()+interval '1 year')$q$,'P0001','conflict','stale renewal revision');
select throws_ok($q$select public.renew_license(pg_temp.lic(7),3,'infinity')$q$,'22023','validation_error','infinite renewal end');
select throws_ok($q$select public.renew_license(null,3,null)$q$,'22023','validation_error','null license');
select throws_ok($q$select public.renew_license(pg_temp.lic(7),-1,null)$q$,'22023','validation_error','negative revision');
select throws_ok($q$select public.renew_license('20000000-0000-4000-8000-0000000000ff',1,null)$q$,'P0001','not_found','missing license');
reset role;

-- Audit metadata.
select results_eq($q$select event_type,revision_before,revision_after,changed_fields from public.license_audit_events where license_id=pg_temp.lic(1) order by revision_after$q$,
  $q$values ('license_created'::text,null::bigint,1::bigint,array['id','tenant_id','status','revision','current_terms_version','plan_key','plan_version','plan_display_label','max_active_users','valid_from','created_at','created_by','updated_at','updated_by']::text[]),
    ('license_terms_changed',1,2,array['revision','current_terms_version','plan_key','plan_display_label','max_active_users','valid_from','updated_at','updated_by']),
    ('license_terms_changed',2,3,array['revision','current_terms_version','plan_key','plan_display_label','max_active_users','valid_from','valid_until','updated_at','updated_by'])$q$,
  'draft terms changes record only changed canonical fields');
select is((select changed_fields from public.license_audit_events where license_id=pg_temp.lic(2) and revision_after=3),
  array['revision','current_terms_version','plan_key','plan_display_label','max_active_users','updated_at','updated_by']::text[],'active plan change excludes unchanged dates');
select is((select changed_fields from public.license_audit_events where license_id=pg_temp.lic(7) and revision_after=3),
  array['revision','current_terms_version','valid_until','updated_at','updated_by']::text[],'early renewal changes only the end');
select is((select changed_fields from public.license_audit_events where license_id=pg_temp.lic(9) and revision_after=2),
  array['revision','current_terms_version','valid_from','valid_until','updated_at','updated_by']::text[],'ended renewal changes start and end');
select ok(a.event_type='license_renewed' and a.correlation_id='00000000-0000-4000-8000-000000000098' and a.actor_user_id='00000000-0000-4000-8000-000000000051' and a.occurred_at=l.updated_at,'renewal audit identity, correlation and decision time')
from public.license_audit_events a join public.licenses l on l.id=a.license_id and a.revision_after=l.revision where l.id=pg_temp.lic(7);
select is((select correlation_id from public.license_audit_events where license_id=pg_temp.lic(1) and revision_after=2),'00000000-0000-4000-8000-000000000099'::uuid,'terms change correlation stored');
select ok(bool_and(l.revision=(select count(*) from public.license_audit_events a where a.license_id=l.id)
  and l.current_terms_version=(select count(*) from public.license_terms_versions t where t.license_id=l.id)),'audit and terms counts match revision and terms version') from public.licenses l;
select results_eq($q$select status,revision,current_terms_version from public.licenses where tenant_id in (pg_temp.t(4),pg_temp.t(5),pg_temp.t(6),pg_temp.t(11),pg_temp.t(12)) order by tenant_id$q$,
  $q$values ('active'::text,2::bigint,1::bigint),('active',2,1),('terminated',2,1),('draft',1,1),('active',2,1)$q$,'rejected requests leave licenses unchanged');

-- Failure injection rolls back the whole mutation (transaction-scoped probes).
alter table public.license_audit_events add constraint test_reject_terms_event check(event_type not in ('license_terms_changed','license_renewed')) not valid;
select throws_ok($q$select public.change_license_terms(pg_temp.lic(2),3,'stor')$q$,'P0001','audit_failure','audit failure rejects terms change');
select throws_ok($q$select public.renew_license(pg_temp.lic(7),3,clock_timestamp()+interval '1 year')$q$,'P0001','audit_failure','audit failure rejects renewal');
alter table public.license_audit_events drop constraint test_reject_terms_event;
alter table public.license_terms_versions add constraint test_reject_terms_row check(version<2) not valid;
select throws_ok($q$select public.change_license_terms(pg_temp.lic(12),2,'stor')$q$,'23514',null,'terms insert failure propagates');
alter table public.license_terms_versions drop constraint test_reject_terms_row;
select results_eq($q$select revision,current_terms_version from public.licenses where tenant_id in (pg_temp.t(2),pg_temp.t(7),pg_temp.t(12)) order by tenant_id$q$,
  $q$values (3::bigint,2::bigint),(3,2),(2,1)$q$,'no partial license change after injected failures');
select throws_ok($q$select public.change_license_terms(pg_temp.lic(12),2,'stor');update public.licenses set current_terms_version=1 where id=pg_temp.lic(12);set constraints all immediate$q$,'23514','license history integrity violation','deferred integrity failure rolls back attempted terms change');
select is((select count(*)::integer from public.license_terms_versions where license_id=pg_temp.lic(12)),1,'no partial terms after deferred failure');
select lives_ok('set constraints all immediate','remaining graph valid');
select * from finish();
rollback;
