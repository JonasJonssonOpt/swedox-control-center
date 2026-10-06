begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);

create function pg_temp.t(n int) returns uuid language sql immutable as $$ select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.i(n int) returns uuid language sql immutable as $$ select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.l(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
-- Latest run of an installation, its revision and a step status.
create function pg_temp.run(inst int) returns uuid language sql stable security definer as $$
  select id from public.provisioning_runs where installation_id=pg_temp.i(inst) order by created_at desc, id desc limit 1 $$;
create function pg_temp.rev(inst int) returns bigint language sql stable security definer as $$ select revision from public.provisioning_runs where id=pg_temp.run(inst) $$;
create function pg_temp.state(inst int) returns text language sql stable security definer as $$
  select r.status||'|'||coalesce(r.blocked_reason,'-')||'|'||r.revision||'|'||
    (select string_agg(s.status||':'||s.attempt_count,',' order by s.position) from public.provisioning_run_steps s where s.run_id=r.id)
  from public.provisioning_runs r where r.id=pg_temp.run(inst) $$;
-- Complete license graph inserted as postgres (fixed dates).
create function pg_temp.license(n int, st text, vfrom timestamptz, vuntil timestamptz) returns void language plpgsql as $$
begin
  insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by)
  values(pg_temp.l(n),pg_temp.t(n),st,'2021-01-01','00000000-0000-4000-8000-000000000051','2021-01-01','00000000-0000-4000-8000-000000000051');
  insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields)
  values(pg_temp.l(n),'license_created','00000000-0000-4000-8000-000000000051','2021-01-01',1,array['id','tenant_id','status','revision']);
  insert into public.license_terms_versions values(pg_temp.l(n),1,1,'mini',1,'Mini',24,vfrom,vuntil);
end $$;

insert into public.tenants(id,category,legal_name,created_by,updated_by)
select pg_temp.t(n),'internal','Provisioning tenant '||n,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,9) n;
update public.tenants set operational_status='paused' where id=pg_temp.t(8);
update public.tenants set archived_at=now(),archived_by='00000000-0000-4000-8000-000000000051' where id=pg_temp.t(9);
-- Installations 1..9 belong to tenants 1..9; 10..15 are extra installations of tenant 1.
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
select pg_temp.i(n),pg_temp.t(case when n<=9 then n else 1 end),'prov-'||n,'Prov '||n,'production','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,15) n;
update public.installations set administrative_status='active' where id=pg_temp.i(1);
update public.installations set administrative_status='paused' where id=pg_temp.i(10);
update public.installations set administrative_status='decommissioned' where id=pg_temp.i(11);
update public.installations set administrative_status='decommissioned',archived_at=now(),archived_by='00000000-0000-4000-8000-000000000051' where id=pg_temp.i(12);
select pg_temp.license(1,'active','2021-01-01',null);
select pg_temp.license(3,'draft','2021-01-01',null);
select pg_temp.license(4,'suspended','2021-01-01',null);
select pg_temp.license(5,'terminated','2021-01-01',null);
select pg_temp.license(6,'active','2999-01-01',null);
select pg_temp.license(7,'active','2021-01-01','2022-01-01');
select pg_temp.license(8,'active','2021-01-01',null);
select pg_temp.license(9,'active','2021-01-01',null);
set constraints all immediate;
set constraints all deferred;

set local role authenticated;

-- Request.
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')$q$,'request for an eligible planned installation');
select is(pg_temp.state(1),'pending|-|1|pending:0,pending:0,pending:0,pending:0,pending:0','pending run with five pending steps');
select throws_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000001')$q$,'P0001','duplicate_run','one open run per installation');
select throws_ok(format('select public.request_provisioning_run(%L)',pg_temp.i(n)),'P0001',msg,label) from (values
  (10,'installation_not_available','paused installation'),
  (11,'installation_not_available','decommissioned installation'),
  (12,'installation_not_available','archived installation'),
  (8,'tenant_not_available','paused tenant'),
  (9,'tenant_not_available','archived tenant'),
  (2,'license_not_eligible','missing license'),
  (3,'license_not_eligible','draft license'),
  (4,'license_not_eligible','suspended license'),
  (5,'license_not_eligible','terminated license'),
  (6,'license_not_eligible','license not started'),
  (7,'license_not_eligible','expired license')
) as cases(n,msg,label);
select throws_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','unknown installation');
select throws_ok('select public.request_provisioning_run(null)','22023','validation_error','null installation');

-- Start, complete and validate results per step.
select lives_ok(format('select public.start_provisioning_step(%L,1,%L)',pg_temp.run(1),'50000000-0000-4000-8000-000000000002'),'start first step');
select is(pg_temp.state(1),'in_progress|-|2|in_progress:1,pending:0,pending:0,pending:0,pending:0','first step in progress');
select throws_ok(format('select public.start_provisioning_step(%L,2)',pg_temp.run(1)),'P0001','invalid_state_transition','cannot start while an attempt is open');
select throws_ok(format('select public.start_provisioning_step(%L,1)',pg_temp.run(1)),'P0001','conflict','stale revision is a conflict');
select throws_ok(q,'22023','validation_error',label) from (values
  (format('select public.complete_provisioning_step(%L,2)',pg_temp.run(1)),'first step without results'),
  (format('select public.complete_provisioning_step(%L,2,%L)',pg_temp.run(1),'proj1'),'project ref without region'),
  (format('select public.complete_provisioning_step(%L,2,%L,%L,%L)',pg_temp.run(1),'proj1','eu-north-1','https://x.example.se'),'url on first step'),
  (format('select public.complete_provisioning_step(%L,2,%L,%L)',pg_temp.run(1),'Proj1','eu-north-1'),'uppercase project ref'),
  (format('select public.complete_provisioning_step(%L,2,%L,%L,null,%L)',pg_temp.run(1),'proj1','eu-north-1',e'tab\there'),'note with tab'),
  (format('select public.complete_provisioning_step(%L,2,%L,%L,null,%L)',pg_temp.run(1),'proj1','eu-north-1',repeat('x',501)),'note too long'),
  (format('select public.complete_provisioning_step(%L,2,%L,%L,null,%L)',pg_temp.run(1),'proj1','eu-north-1',' padded'),'untrimmed note'),
  (format('select public.complete_provisioning_step(%L,0,%L,%L)',pg_temp.run(1),'proj1','eu-north-1'),'non-positive revision')
) as cases(q,label);
select is(pg_temp.rev(1),2::bigint,'rejected completions wrote nothing');
select lives_ok(format('select public.complete_provisioning_step(%L,2,%L,%L,null,%L)',pg_temp.run(1),'proj1','eu-north-1',e'Skapat i\nStockholm'),'complete first step with results and note');
select is(pg_temp.state(1),'in_progress|-|3|succeeded:1,pending:0,pending:0,pending:0,pending:0','first step succeeded');
reset role;
select results_eq(format('select result_supabase_project_ref,result_hosting_region,result_application_url from public.provisioning_runs where id=%L',pg_temp.run(1)),
  $q$values ('proj1'::text,'eu-north-1'::text,null::text)$q$,'project results recorded');
set local role authenticated;
select throws_ok(format('select public.complete_provisioning_step(%L,3)',pg_temp.run(1)),'P0001','invalid_state_transition','nothing open to complete');
select throws_ok(format('select public.fail_provisioning_step(%L,3,%L)',pg_temp.run(1),'timeout'),'P0001','invalid_state_transition','nothing open to fail');

-- Failure and manual retry.
select lives_ok(format('select public.start_provisioning_step(%L,3)',pg_temp.run(1)),'start second step');
select throws_ok(format('select public.complete_provisioning_step(%L,4,%L,%L)',pg_temp.run(1),'proj9','eu-north-1'),'22023','validation_error','second step takes no results');
select throws_ok(format('select public.fail_provisioning_step(%L,4,%L)',pg_temp.run(1),'unknown'),'22023','validation_error','unknown failure category');
select throws_ok(format('select public.fail_provisioning_step(%L,4,null)',pg_temp.run(1)),'22023','validation_error','missing failure category');
select lives_ok(format('select public.fail_provisioning_step(%L,4,%L,%L)',pg_temp.run(1),'configuration_error','Migration 12 saknar extension'),'fail second step');
select is(pg_temp.state(1),'failed|-|5|succeeded:1,failed:1,pending:0,pending:0,pending:0','run failed at step two');
reset role;
select results_eq(format('select outcome,failure_category,note from public.provisioning_step_attempts where run_id=%L and step_key=%L',pg_temp.run(1),'database_schema'),
  $q$values ('failed'::text,'configuration_error'::text,'Migration 12 saknar extension'::text)$q$,'failure category and note recorded');
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,5)',pg_temp.run(1)),'retry the failed step');
select is(pg_temp.state(1),'in_progress|-|6|succeeded:1,in_progress:2,pending:0,pending:0,pending:0','retry is attempt two of the same step');
select lives_ok(format('select public.complete_provisioning_step(%L,6)',pg_temp.run(1)),'complete retried step');

-- Third step requires a valid URL.
select lives_ok(format('select public.start_provisioning_step(%L,7)',pg_temp.run(1)),'start third step');
select throws_ok(format('select public.complete_provisioning_step(%L,8)',pg_temp.run(1)),'22023','validation_error','third step without url');
select throws_ok(format('select public.complete_provisioning_step(%L,8,null,null,%L)',pg_temp.run(1),'http://app.example.se'),'22023','validation_error','non-https url');
select lives_ok(format('select public.complete_provisioning_step(%L,8,null,null,%L)',pg_temp.run(1),'https://app1.example.se'),'complete third step with url');

-- License suspended mid-run blocks the next start; reactivation resumes it.
select lives_ok($q$select public.suspend_license('40000000-0000-4000-8000-000000000001',1)$q$,'suspend the license through Licensing');
select lives_ok(format('select public.start_provisioning_step(%L,9)',pg_temp.run(1)),'start re-checks the license');
select is(pg_temp.state(1),'blocked|license_suspended|10|succeeded:1,succeeded:2,succeeded:1,pending:1,pending:0','blocked attempt on step four');
reset role;
select results_eq(format('select step_key,attempt_number,outcome,blocked_reason,started_at=finished_at from public.provisioning_step_attempts where run_id=%L and outcome=%L',pg_temp.run(1),'blocked'),
  $q$values ('initial_administrator'::text,1,'blocked'::text,'license_suspended'::text,true)$q$,'blocked attempt is instantaneous with its reason');
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,10)',pg_temp.run(1)),'still suspended: blocked again');
select is(pg_temp.state(1),'blocked|license_suspended|11|succeeded:1,succeeded:2,succeeded:1,pending:2,pending:0','second blocked attempt');
select lives_ok($q$select public.activate_license('40000000-0000-4000-8000-000000000001',2)$q$,'reactivate the license');
select lives_ok(format('select public.start_provisioning_step(%L,11)',pg_temp.run(1)),'resume after reactivation');
select is(pg_temp.state(1),'in_progress|-|12|succeeded:1,succeeded:2,succeeded:1,in_progress:3,pending:0','administrator step in progress as attempt three');
select throws_ok(format('select public.complete_provisioning_step(%L,12,null,null,%L)',pg_temp.run(1),'https://x.example.se'),'22023','validation_error','administrator step takes no results');
select lives_ok(format('select public.complete_provisioning_step(%L,12)',pg_temp.run(1)),'administrator invited');
select lives_ok(format('select public.start_provisioning_step(%L,13)',pg_temp.run(1)),'start verification');
select lives_ok(format('select public.complete_provisioning_step(%L,14,null,null,null,%L,%L)',pg_temp.run(1),'Inloggning verifierad','50000000-0000-4000-8000-000000000003'),'verification completes the run');
select is(pg_temp.state(1),'succeeded|-|15|succeeded:1,succeeded:2,succeeded:1,succeeded:3,succeeded:1','run succeeded');
reset role;
select ok((select finished_at is not null and finished_at=updated_at from public.provisioning_runs where id=pg_temp.run(1)),'finished_at is the decision time');
set local role authenticated;
select throws_ok(q,'P0001','invalid_state_transition',label) from (values
  (format('select public.start_provisioning_step(%L,15)',pg_temp.run(1)),'no start after success'),
  (format('select public.complete_provisioning_step(%L,15)',pg_temp.run(1)),'no complete after success'),
  (format('select public.fail_provisioning_step(%L,15,%L)',pg_temp.run(1),'other'),'no fail after success'),
  (format('select public.cancel_provisioning_run(%L,15)',pg_temp.run(1)),'no cancel after success')
) as cases(q,label);

-- Audit: one event per mutation, run_succeeded last, correlation and actor bound.
reset role;
select results_eq(format('select event_type,step_key,attempt_number from public.provisioning_audit_events where run_id=%L order by revision_after',pg_temp.run(1)),
  $q$values ('run_requested'::text,null::text,null::integer),('step_started','supabase_project',1),('step_succeeded','supabase_project',1),
  ('step_started','database_schema',1),('step_failed','database_schema',1),('step_started','database_schema',2),('step_succeeded','database_schema',2),
  ('step_started','application_deployment',1),('step_succeeded','application_deployment',1),('step_blocked','initial_administrator',1),
  ('step_blocked','initial_administrator',2),('step_started','initial_administrator',3),('step_succeeded','initial_administrator',3),
  ('step_started','installation_verification',1),('run_succeeded','installation_verification',1)$q$,'exact audit chain');
select results_eq(format('select revision_after,correlation_id from public.provisioning_audit_events where run_id=%L and correlation_id is not null order by revision_after',pg_temp.run(1)),
  $q$values (1::bigint,'50000000-0000-4000-8000-000000000001'::uuid),(2,'50000000-0000-4000-8000-000000000002'),(15,'50000000-0000-4000-8000-000000000003')$q$,'correlation ids recorded');
select ok((select bool_and(actor_user_id='00000000-0000-4000-8000-000000000051') from public.provisioning_audit_events),'actor is always auth.uid()');
set local role authenticated;
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000001')$q$,'a new run is allowed after success');

-- Installation availability is re-checked at start.
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000013')$q$,'request on installation 13');
reset role;
update public.installations set administrative_status='paused' where id=pg_temp.i(13);
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,1)',pg_temp.run(13)),'start on paused installation');
select is(pg_temp.state(13),'blocked|installation_not_available|2|pending:1,pending:0,pending:0,pending:0,pending:0','blocked by installation');
reset role;
update public.installations set administrative_status='active' where id=pg_temp.i(13);
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,2)',pg_temp.run(13)),'resume after installation is active');
select is(pg_temp.state(13),'in_progress|-|3|in_progress:2,pending:0,pending:0,pending:0,pending:0','in progress after block');

-- Cancel from every non-terminal state.
select lives_ok(format('select public.cancel_provisioning_run(%L,3)',pg_temp.run(13)),'cancel with an open attempt');
select is(pg_temp.state(13),'cancelled|-|4|pending:2,pending:0,pending:0,pending:0,pending:0','open attempt closed, step back to pending');
reset role;
select results_eq(format('select outcome from public.provisioning_step_attempts where run_id=%L order by attempt_number',pg_temp.run(13)),
  $q$values ('blocked'::text),('cancelled')$q$,'attempt outcome cancelled');
set local role authenticated;
select throws_ok(format('select public.cancel_provisioning_run(%L,4)',pg_temp.run(13)),'P0001','invalid_state_transition','no double cancel');
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000014');$q$,'pending run on 14');
select throws_ok(format('select public.cancel_provisioning_run(%L,2)',pg_temp.run(14)),'P0001','conflict','cancel with stale revision');
select lives_ok(format('select public.cancel_provisioning_run(%L,1)',pg_temp.run(14)),'cancel pending');
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000015')$q$,'run on 15');
select lives_ok(format('select public.start_provisioning_step(%L,1);select public.fail_provisioning_step(%L,2,%L)',pg_temp.run(15),pg_temp.run(15),'timeout'),'failed run on 15');
select lives_ok(format('select public.cancel_provisioning_run(%L,3)',pg_temp.run(15)),'cancel failed');
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000013')$q$,'cancelled run frees the installation');
reset role;
update public.installations set administrative_status='paused' where id=pg_temp.i(13);
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,1)',pg_temp.run(13)),'blocked run on 13');
select lives_ok(format('select public.cancel_provisioning_run(%L,2)',pg_temp.run(13)),'cancel blocked');
select is(pg_temp.state(13),'cancelled|-|3|pending:1,pending:0,pending:0,pending:0,pending:0','blocked reason cleared on cancel');

-- Not found and validation.
select throws_ok(q,code::char(5),msg,label) from (values
  ($q$select public.start_provisioning_step('30000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','start unknown run'),
  ($q$select public.complete_provisioning_step('30000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','complete unknown run'),
  ($q$select public.fail_provisioning_step('30000000-0000-4000-8000-0000000000ff',1,'other')$q$,'P0001','not_found','fail unknown run'),
  ($q$select public.cancel_provisioning_run('30000000-0000-4000-8000-0000000000ff',1)$q$,'P0001','not_found','cancel unknown run'),
  ('select public.start_provisioning_step(null,1)','22023','validation_error','start null run'),
  (format('select public.start_provisioning_step(%L,null)',pg_temp.run(13)),'22023','validation_error','start null revision'),
  (format('select public.cancel_provisioning_run(%L,0)',pg_temp.run(13)),'22023','validation_error','cancel zero revision')
) as cases(q,code,msg,label);

-- Every committed graph satisfies the deferred integrity check.
select lives_ok('set constraints all immediate','all graphs pass the deferred integrity check');
set constraints all deferred;
reset role;
select is((select count(*)::integer from public.provisioning_runs r where r.revision <> (select count(*) from public.provisioning_audit_events a where a.run_id=r.id)),0,'revision equals audit count for every run');
select * from finish();
rollback;
