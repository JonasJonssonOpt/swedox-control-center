begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);

insert into public.tenants(id,category,legal_name,created_by,updated_by) values
('10000000-0000-4000-8000-000000000001','internal','Alfa AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
('10000000-0000-4000-8000-000000000002','internal','Beta AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  case when n<=4 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
  'read-'||n,'Read '||n,'production','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,6) n;

create function pg_temp.i(n int) returns uuid language sql immutable as $$ select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.r(n int) returns uuid language sql immutable as $$ select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.rev(n int) returns bigint language sql stable as $$ select revision from public.provisioning_runs where id=pg_temp.r(n) $$;
create function pg_temp.audit(n int, ev text, step text, att int) returns void language sql as $$
  insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,occurred_at,revision_before,revision_after)
  values(pg_temp.r(n),ev,step,att,'00000000-0000-4000-8000-000000000051',clock_timestamp(),pg_temp.rev(n)-1,pg_temp.rev(n))
$$;
create function pg_temp.new_run(n int, inst int, created timestamptz) returns void language plpgsql as $$
begin
  insert into public.provisioning_runs(id,installation_id,created_at,created_by,updated_at,updated_by)
  values(pg_temp.r(n),pg_temp.i(inst),created,'00000000-0000-4000-8000-000000000051',created,'00000000-0000-4000-8000-000000000051');
  insert into public.provisioning_run_steps(run_id,step_key,position) values
    (pg_temp.r(n),'supabase_project',1),(pg_temp.r(n),'database_schema',2),(pg_temp.r(n),'application_deployment',3),(pg_temp.r(n),'installation_verification',4);
  insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,occurred_at,revision_after) values(pg_temp.r(n),'run_requested','00000000-0000-4000-8000-000000000051',created,1);
end $$;
create function pg_temp.start(n int, step text, started timestamptz default null) returns void language plpgsql as $$
declare att int;
begin
  update public.provisioning_runs set revision=revision+1,status='in_progress',blocked_reason=null,updated_at=clock_timestamp() where id=pg_temp.r(n);
  update public.provisioning_run_steps set status='in_progress',attempt_count=attempt_count+1 where run_id=pg_temp.r(n) and step_key=step returning attempt_count into att;
  insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_at,started_revision) values(pg_temp.r(n),step,att,coalesce(started,clock_timestamp()),pg_temp.rev(n));
  perform pg_temp.audit(n,'step_started',step,att);
end $$;
create function pg_temp.block(n int, step text, reason text) returns void language plpgsql as $$
declare att int; t timestamptz := clock_timestamp();
begin
  update public.provisioning_runs set revision=revision+1,status='blocked',blocked_reason=reason,updated_at=t where id=pg_temp.r(n);
  update public.provisioning_run_steps set attempt_count=attempt_count+1 where run_id=pg_temp.r(n) and step_key=step returning attempt_count into att;
  insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_at,started_revision,outcome,finished_at,finished_revision,blocked_reason)
  values(pg_temp.r(n),step,att,t,pg_temp.rev(n),'blocked',t,pg_temp.rev(n),reason);
  perform pg_temp.audit(n,'step_blocked',step,att);
end $$;
create function pg_temp.finish(n int, step text, result text, category text default null, note text default null,
  ref text default null, region text default null, url text default null) returns void language plpgsql as $$
declare att int; last_step boolean := step='installation_verification' and result='succeeded'; t timestamptz := clock_timestamp();
begin
  update public.provisioning_runs set revision=revision+1,
    status=case when last_step then 'succeeded' when result='failed' then 'failed' else 'in_progress' end,
    finished_at=case when last_step then t end,updated_at=t,
    result_supabase_project_ref=coalesce(ref,result_supabase_project_ref),result_hosting_region=coalesce(region,result_hosting_region),
    result_application_url=coalesce(url,result_application_url)
  where id=pg_temp.r(n);
  update public.provisioning_run_steps set status=result,completed_at=case when result='succeeded' then t end
  where run_id=pg_temp.r(n) and step_key=step returning attempt_count into att;
  update public.provisioning_step_attempts set outcome=result,finished_at=t,finished_revision=pg_temp.rev(n),failure_category=category,note=finish.note
  where run_id=pg_temp.r(n) and step_key=step and attempt_number=att;
  perform pg_temp.audit(n,case when last_step then 'run_succeeded' when result='failed' then 'step_failed' else 'step_succeeded' end,step,att);
end $$;
create function pg_temp.cancel(n int) returns void language plpgsql as $$
declare t timestamptz := clock_timestamp();
begin
  update public.provisioning_runs set revision=revision+1,status='cancelled',blocked_reason=null,finished_at=t,updated_at=t where id=pg_temp.r(n);
  insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,occurred_at,revision_before,revision_after)
  values(pg_temp.r(n),'run_cancelled','00000000-0000-4000-8000-000000000051',t,pg_temp.rev(n)-1,pg_temp.rev(n));
end $$;
create function pg_temp.seq(call text) returns text language plpgsql as $$
declare result text;
begin
  execute format('select coalesce(string_agg(right(r.id::text,2),%L order by r.ordinality),%L) from %s with ordinality as r', ',', '', call) into result;
  return result;
end $$;

-- R1 succeeded and R2 cancelled (closed), R3 stale in_progress, R4 failed at
-- step 2, R5 blocked, R6 pending, R7 fresh in_progress on the same
-- installation as the closed R1.
select pg_temp.new_run(1,1,'2026-01-01');
select pg_temp.start(1,'supabase_project'); select pg_temp.finish(1,'supabase_project','succeeded',ref=>'proj1',region=>'eu-north-1');
select pg_temp.start(1,'database_schema'); select pg_temp.finish(1,'database_schema','succeeded');
select pg_temp.start(1,'application_deployment'); select pg_temp.finish(1,'application_deployment','succeeded',url=>'https://app1.example.se');
select pg_temp.start(1,'installation_verification'); select pg_temp.finish(1,'installation_verification','succeeded');
select pg_temp.new_run(2,2,'2026-01-02'); select pg_temp.cancel(2);
select pg_temp.new_run(3,3,'2026-01-03'); select pg_temp.start(3,'supabase_project',clock_timestamp()-interval '25 hours');
select pg_temp.new_run(4,4,'2026-01-04');
select pg_temp.start(4,'supabase_project'); select pg_temp.finish(4,'supabase_project','succeeded',ref=>'proj4',region=>'eu-north-1');
select pg_temp.start(4,'database_schema'); select pg_temp.finish(4,'database_schema','failed','configuration_error',e'Migration 12 saknar\nextension');
select pg_temp.new_run(5,5,'2026-01-05'); select pg_temp.block(5,'supabase_project','license_suspended');
select pg_temp.new_run(6,6,'2026-01-06');
select pg_temp.new_run(7,1,'2026-01-07'); select pg_temp.start(7,'supabase_project');
set constraints all immediate;
set constraints all deferred;

set local role authenticated;

-- List: default hides closed runs, created_at DESC.
select is(pg_temp.seq('public.list_provisioning_runs()'),'07,06,05,04,03','default list hides succeeded and cancelled');
select is(pg_temp.seq('public.list_provisioning_runs(p_include_closed=>true)'),'07,06,05,04,03,02,01','includeClosed shows history');
select results_eq($q$select right(id::text,2),installation_display_name,installation_code,tenant_legal_name,status,blocked_reason,next_step_key,revision
  from public.list_provisioning_runs(p_include_closed=>true) order by created_at$q$,
  $q$values ('01'::text,'Read 1'::text,'read-1'::text,'Alfa AB'::text,'succeeded'::text,null::text,null::text,9::bigint),
  ('02','Read 2','read-2','Alfa AB','cancelled',null,'supabase_project',2),
  ('03','Read 3','read-3','Alfa AB','in_progress',null,'supabase_project',2),
  ('04','Read 4','read-4','Alfa AB','failed',null,'database_schema',5),
  ('05','Read 5','read-5','Beta AB','blocked','license_suspended','supabase_project',2),
  ('06','Read 6','read-6','Beta AB','pending',null,'supabase_project',1),
  ('07','Read 1','read-1','Alfa AB','in_progress',null,'supabase_project',2)$q$,'list rows carry names, status, reason and next step');
select is(pg_temp.seq(format('public.list_provisioning_runs(p_installation_id=>%L,p_include_closed=>true)',pg_temp.i(1))),'07,01','installation filter');
select is(pg_temp.seq($q$public.list_provisioning_runs(p_tenant_id=>'10000000-0000-4000-8000-000000000002')$q$),'06,05','tenant filter');
select is(pg_temp.seq($q$public.list_provisioning_runs(p_status=>'failed')$q$),'04','status filter');
select is(pg_temp.seq($q$public.list_provisioning_runs(p_status=>'succeeded',p_include_closed=>true)$q$),'01','closed status with includeClosed');
select is(pg_temp.seq($q$public.list_provisioning_runs(p_tenant_id=>'10000000-0000-4000-8000-0000000000ff')$q$),'','unknown tenant filter is empty');

-- Keyset pagination.
select is(pg_temp.seq('public.list_provisioning_runs(2)'),'07,06','first page');
select results_eq($q$select distinct has_more,next_cursor_id from public.list_provisioning_runs(2)$q$,
  $q$values (true,'30000000-0000-4000-8000-000000000006'::uuid)$q$,'cursor is the last row');
select is(pg_temp.seq($q$public.list_provisioning_runs(2,'2026-01-06','30000000-0000-4000-8000-000000000006')$q$),'05,04','second page');
select is(pg_temp.seq($q$public.list_provisioning_runs(2,'2026-01-04','30000000-0000-4000-8000-000000000004')$q$),'03','last page');
select is((select count(*)::integer from public.list_provisioning_runs(2,'2026-01-04','30000000-0000-4000-8000-000000000004') where has_more or next_cursor_id is not null),0,'last page has no cursor');
select is((select count(*)::integer from public.list_provisioning_runs(5) where has_more),0,'exact page size has no next page');

select throws_ok(q,'22023','validation_error',label) from (values
  ('select * from public.list_provisioning_runs(0)','page size 0'),
  ('select * from public.list_provisioning_runs(101)','page size 101'),
  ('select * from public.list_provisioning_runs(null)','null page size'),
  ('select * from public.list_provisioning_runs(p_include_closed=>null)','null includeClosed'),
  ($q$select * from public.list_provisioning_runs(p_status=>'done')$q$,'unknown status'),
  ($q$select * from public.list_provisioning_runs(p_status=>'cancelled')$q$,'closed status without includeClosed'),
  ($q$select * from public.list_provisioning_runs(2,'2026-01-06',null)$q$,'cursor time without id'),
  ($q$select * from public.list_provisioning_runs(2,null,'30000000-0000-4000-8000-000000000006')$q$,'cursor id without time'),
  ($q$select * from public.list_provisioning_runs(2,'infinity','30000000-0000-4000-8000-000000000006')$q$,'infinite cursor'),
  ($q$select * from public.list_provisioning_runs(2,'2026-01-06 00:00:00.000001','30000000-0000-4000-8000-000000000006')$q$,'cursor time mismatch'),
  ($q$select * from public.list_provisioning_runs(2,'2026-01-06','30000000-0000-4000-8000-0000000000ff')$q$,'unknown cursor'),
  (format('select * from public.list_provisioning_runs(2,%L,%L,p_installation_id=>%L)','2026-01-06',pg_temp.r(6),pg_temp.i(1)),'cursor outside installation filter'),
  ($q$select * from public.list_provisioning_runs(2,'2026-01-06','30000000-0000-4000-8000-000000000006',p_tenant_id=>'10000000-0000-4000-8000-000000000001')$q$,'cursor outside tenant filter')
) as cases(q,label);

-- Detail: one row per step, results, staleness.
select results_eq(format('select step_key,step_position::integer,step_status,step_attempt_count,open_attempt_number,is_stale from public.get_provisioning_run(%L)',pg_temp.r(4)),
  $q$values ('supabase_project'::text,1,'succeeded'::text,1,null::integer,false),('database_schema',2,'failed',1,null,false),
  ('application_deployment',3,'pending',0,null,false),('installation_verification',4,'pending',0,null,false)$q$,'detail lists the four steps in order');
select results_eq(format('select distinct status,result_supabase_project_ref,result_hosting_region,result_application_url,revision,installation_environment,tenant_legal_name,catalog_version from public.get_provisioning_run(%L)',pg_temp.r(4)),
  $q$values ('failed'::text,'proj4'::text,'eu-north-1'::text,null::text,5::bigint,'production'::text,'Alfa AB'::text,1)$q$,'detail run fields and recorded results');
select results_eq(format('select step_key,open_attempt_number,is_stale from public.get_provisioning_run(%L) where open_attempt_number is not null',pg_temp.r(3)),
  $q$values ('supabase_project'::text,1,true)$q$,'open attempt older than 24 hours is stale');
select results_eq(format('select step_key,is_stale from public.get_provisioning_run(%L) where open_attempt_number is not null',pg_temp.r(7)),
  $q$values ('supabase_project'::text,false)$q$,'fresh open attempt is not stale');
select is((select count(distinct evaluated_at)::integer from public.get_provisioning_run(pg_temp.r(1))),1,'one evaluation time');
select is((select string_agg(step_status,',' order by step_position) from public.get_provisioning_run(pg_temp.r(1))),'succeeded,succeeded,succeeded,succeeded','succeeded run readable');
select throws_ok($q$select * from public.get_provisioning_run('30000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','unknown run');
select throws_ok('select * from public.get_provisioning_run(null)','22023','validation_error','null run');

-- Attempts, newest first, including the operator note.
select results_eq(format('select step_key,attempt_number,outcome,failure_category,note from public.list_provisioning_step_attempts(%L)',pg_temp.r(4)),
  $q$values ('database_schema'::text,1,'failed'::text,'configuration_error'::text,e'Migration 12 saknar\nextension'::text),
  ('supabase_project',1,'succeeded',null,null)$q$,'attempts newest first with category and note');
select results_eq(format('select step_key,outcome,blocked_reason from public.list_provisioning_step_attempts(%L)',pg_temp.r(5)),
  $q$values ('supabase_project'::text,'blocked'::text,'license_suspended'::text)$q$,'blocked attempt with reason');
select set_config('test.attempt_at',(select next_cursor_started_at::text from public.list_provisioning_step_attempts(pg_temp.r(4),1) limit 1),true);
select set_config('test.attempt_id',(select next_cursor_id::text from public.list_provisioning_step_attempts(pg_temp.r(4),1) limit 1),true);
select results_eq(format('select step_key,has_more from public.list_provisioning_step_attempts(%L,1,%L,%L)',pg_temp.r(4),current_setting('test.attempt_at'),current_setting('test.attempt_id')),
  $q$values ('supabase_project'::text,false)$q$,'attempt continuation');
select is((select count(*)::integer from public.list_provisioning_step_attempts(pg_temp.r(6))),0,'pending run has no attempts');

-- Audit, newest first, metadata only.
select results_eq(format('select event_type,step_key,attempt_number,revision_before,revision_after from public.list_provisioning_audit_events(%L)',pg_temp.r(4)),
  $q$values ('step_failed'::text,'database_schema'::text,1,4::bigint,5::bigint),('step_started','database_schema',1,3,4),
  ('step_succeeded','supabase_project',1,2,3),('step_started','supabase_project',1,1,2),('run_requested',null,null,null,1)$q$,'audit chain newest first');
select set_config('test.at',(select next_cursor_occurred_at::text from public.list_provisioning_audit_events(pg_temp.r(4),2) limit 1),true);
select set_config('test.id',(select next_cursor_id::text from public.list_provisioning_audit_events(pg_temp.r(4),2) limit 1),true);
select is((select count(*)::integer from public.list_provisioning_audit_events(pg_temp.r(4),2,current_setting('test.at')::timestamptz,current_setting('test.id')::uuid)),2,'audit second page');
select ok((select bool_and(actor_user_id='00000000-0000-4000-8000-000000000051' and run_id=pg_temp.r(4)) from public.list_provisioning_audit_events(pg_temp.r(4))),'audit rows are run-bound with internal actor');

select throws_ok(q,code::char(5),msg,label) from (values
  ($q$select * from public.list_provisioning_step_attempts('30000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','attempts of unknown run'),
  ('select * from public.list_provisioning_step_attempts(null)','22023','validation_error','attempts null run'),
  (format('select * from public.list_provisioning_step_attempts(%L,0)',pg_temp.r(4)),'22023','validation_error','attempts page size 0'),
  (format('select * from public.list_provisioning_step_attempts(%L,1,%L,null)',pg_temp.r(4),'2026-01-01'),'22023','validation_error','attempts partial cursor'),
  (format('select * from public.list_provisioning_step_attempts(%L,1,%L,%L)',pg_temp.r(1),current_setting('test.attempt_at'),current_setting('test.attempt_id')),'22023','validation_error','attempt cursor of another run'),
  ($q$select * from public.list_provisioning_audit_events('30000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','audit of unknown run'),
  (format('select * from public.list_provisioning_audit_events(%L,101)',pg_temp.r(4)),'22023','validation_error','audit page size 101'),
  (format('select * from public.list_provisioning_audit_events(%L,2,null,%L)',pg_temp.r(4),current_setting('test.id')),'22023','validation_error','audit partial cursor'),
  (format('select * from public.list_provisioning_audit_events(%L,2,%L,%L)',pg_temp.r(1),current_setting('test.at'),current_setting('test.id')),'22023','validation_error','audit cursor of another run')
) as cases(q,code,msg,label);

-- Reads never write.
reset role;
select results_eq($q$select count(*)::integer,sum(revision)::integer from public.provisioning_runs$q$,$q$values (7,23)$q$,'reads changed no run');
select is((select count(*)::integer from public.provisioning_audit_events),23,'reads wrote no audit');
select * from finish();
rollback;
