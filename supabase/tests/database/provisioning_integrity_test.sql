begin;
select no_plan();
-- Graph fixtures written as postgres exactly as the future F2E5 RPCs will:
-- every mutation is revision +1 with one audit event.
insert into public.tenants(id,category,legal_name,created_by,updated_by)
values('10000000-0000-4000-8000-000000000001','internal','Provisioning integrity','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','integrity-'||n,'Integrity '||n,'production',
  '00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,40) n;

create function pg_temp.i(n int) returns uuid language sql immutable as $$ select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.r(n int) returns uuid language sql immutable as $$ select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.rev(n int) returns bigint language sql stable as $$ select revision from public.provisioning_runs where id=pg_temp.r(n) $$;
create function pg_temp.audit(n int, ev text, step text, att int) returns void language sql as $$
  insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after)
  values(pg_temp.r(n),ev,step,att,'00000000-0000-4000-8000-000000000051',pg_temp.rev(n)-1,pg_temp.rev(n))
$$;
create function pg_temp.new_run(n int, inst int default null) returns void language plpgsql as $$
begin
  insert into public.provisioning_runs(id,installation_id,created_by,updated_by) values(pg_temp.r(n),pg_temp.i(coalesce(inst,n)),'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
  insert into public.provisioning_run_steps(run_id,step_key,position) values
    (pg_temp.r(n),'supabase_project',1),(pg_temp.r(n),'database_schema',2),(pg_temp.r(n),'application_deployment',3),(pg_temp.r(n),'initial_administrator',4),(pg_temp.r(n),'installation_verification',5);
  insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_after) values(pg_temp.r(n),'run_requested','00000000-0000-4000-8000-000000000051',1);
end $$;
create function pg_temp.start(n int, step text) returns void language plpgsql as $$
declare att int;
begin
  update public.provisioning_runs set revision=revision+1,status='in_progress',blocked_reason=null,updated_at=clock_timestamp() where id=pg_temp.r(n);
  update public.provisioning_run_steps set status='in_progress',attempt_count=attempt_count+1 where run_id=pg_temp.r(n) and step_key=step returning attempt_count into att;
  insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision) values(pg_temp.r(n),step,att,pg_temp.rev(n));
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
  update public.provisioning_run_steps s set status='pending' where s.run_id=pg_temp.r(n)
    and exists (select 1 from public.provisioning_step_attempts a where a.run_id=s.run_id and a.step_key=s.step_key and a.outcome is null);
  update public.provisioning_step_attempts set outcome='cancelled',finished_at=t,finished_revision=pg_temp.rev(n) where run_id=pg_temp.r(n) and outcome is null;
  insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_before,revision_after)
  values(pg_temp.r(n),'run_cancelled','00000000-0000-4000-8000-000000000051',pg_temp.rev(n)-1,pg_temp.rev(n));
end $$;
create function pg_temp.full(n int) returns void language plpgsql as $$
begin
  perform pg_temp.new_run(n);
  perform pg_temp.start(n,'supabase_project'); perform pg_temp.finish(n,'supabase_project','succeeded',ref=>'proj'||n,region=>'eu-north-1');
  perform pg_temp.start(n,'database_schema'); perform pg_temp.finish(n,'database_schema','succeeded');
  perform pg_temp.start(n,'application_deployment'); perform pg_temp.finish(n,'application_deployment','succeeded',url=>'https://app'||n||'.example.se');
  perform pg_temp.start(n,'initial_administrator'); perform pg_temp.finish(n,'initial_administrator','succeeded');
  perform pg_temp.start(n,'installation_verification'); perform pg_temp.finish(n,'installation_verification','succeeded');
end $$;
-- Applies a corruption on top of a valid graph and expects the commit check.
create function pg_temp.corrupt(sql text) returns text language plpgsql as $$
begin
  begin
    execute sql;
    set constraints all immediate;
    return 'committed';
  exception when others then
    return sqlstate || ':' || sqlerrm;
  end;
end $$;

-- Valid graphs in every run state pass the deferred check.
select lives_ok($q$select pg_temp.new_run(1);set constraints all immediate$q$,'pending run');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(2);select pg_temp.start(2,'supabase_project');set constraints all immediate$q$,'in_progress with open attempt');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(3);select pg_temp.block(3,'supabase_project','license_suspended');set constraints all immediate$q$,'blocked at first start');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(4);select pg_temp.start(4,'supabase_project');select pg_temp.finish(4,'supabase_project','failed','provider_error',e'Kvot slut\nförsök igen');
  select pg_temp.start(4,'supabase_project');select pg_temp.finish(4,'supabase_project','succeeded',ref=>'proj4',region=>'eu-north-1');set constraints all immediate$q$,'failed step retried and succeeded with multiline note');
set constraints all deferred;
select lives_ok($q$select pg_temp.full(5);set constraints all immediate$q$,'fully succeeded run');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(6);select pg_temp.start(6,'supabase_project');select pg_temp.cancel(6);set constraints all immediate$q$,'cancelled during open attempt');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(7);select pg_temp.block(7,'supabase_project','tenant_not_available');select pg_temp.start(7,'supabase_project');
  select pg_temp.finish(7,'supabase_project','succeeded',ref=>'proj7',region=>'eu-north-1');select pg_temp.block(7,'database_schema','license_expired');set constraints all immediate$q$,'blocked then resumed then blocked on next step');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(8);select pg_temp.cancel(8);set constraints all immediate$q$,'pending run cancelled');
set constraints all deferred;
select lives_ok($q$select pg_temp.new_run(9,8);set constraints all immediate$q$,'a cancelled run frees the installation for a new run');
set constraints all deferred;
select results_eq($q$select status from public.provisioning_runs where id in (pg_temp.r(1),pg_temp.r(2),pg_temp.r(3),pg_temp.r(4),pg_temp.r(5),pg_temp.r(6),pg_temp.r(7)) order by id$q$,
  $q$values ('pending'::text),('in_progress'),('blocked'),('in_progress'),('succeeded'),('cancelled'),('blocked')$q$,'fixtures reached the intended states');

-- Deferred structural violations are rejected at commit (23514).
select is(pg_temp.corrupt(q),'23514:provisioning run integrity violation',label) from (values
  ($q$update public.provisioning_runs set revision=revision+1 where id=pg_temp.r(1)$q$,'revision without audit'),
  ($q$insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after) values(pg_temp.r(5),'step_started','supabase_project',9,'00000000-0000-4000-8000-000000000051',11,12)$q$,'audit beyond revision'),
  ($q$insert into public.provisioning_runs(id,installation_id,created_by,updated_by) values(pg_temp.r(30),pg_temp.i(30),'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
    insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_after) values(pg_temp.r(30),'run_requested','00000000-0000-4000-8000-000000000051',1)$q$,'run without its five steps'),
  ($q$update public.provisioning_run_steps set attempt_count=2 where run_id=pg_temp.r(2) and step_key='supabase_project'$q$,'attempt_count mismatch'),
  ($q$update public.provisioning_run_steps set status='failed' where run_id=pg_temp.r(2) and step_key='supabase_project'$q$,'step status contradicts open attempt'),
  ($q$select pg_temp.new_run(38);select pg_temp.start(38,'supabase_project');select pg_temp.finish(38,'supabase_project','failed','timeout');
    select pg_temp.start(38,'database_schema')$q$,'second step while first failed'),
  ($q$update public.provisioning_runs set status='failed' where id=pg_temp.r(2)$q$,'run status contradicts latest attempt'),
  ($q$update public.provisioning_runs set result_application_url='https://early.example.se' where id=pg_temp.r(2)$q$,'result before its step succeeded'),
  ($q$select pg_temp.finish(2,'supabase_project','succeeded')$q$,'first step succeeded without project ref'),
  ($q$update public.provisioning_runs set blocked_reason='license_draft' where id=pg_temp.r(3)$q$,'blocked reason differs from latest attempt'),
  ($q$select pg_temp.new_run(31);select pg_temp.start(31,'supabase_project');update public.provisioning_runs set revision=revision+1,status='cancelled',finished_at=clock_timestamp() where id=pg_temp.r(31);
    select pg_temp.audit(31,'run_cancelled',null,null)$q$,'cancelled with an open attempt'),
  ($q$select pg_temp.new_run(32);select pg_temp.start(32,'supabase_project');update public.provisioning_audit_events set step_key=step_key where false;
    update public.provisioning_runs set revision=revision+1,status='in_progress',result_supabase_project_ref='proj32',result_hosting_region='eu-north-1' where id=pg_temp.r(32);
    update public.provisioning_run_steps set status='succeeded',completed_at=clock_timestamp() where run_id=pg_temp.r(32) and step_key='supabase_project';
    update public.provisioning_step_attempts set outcome='succeeded',finished_at=clock_timestamp(),finished_revision=3 where run_id=pg_temp.r(32);
    select pg_temp.audit(32,'step_failed','supabase_project',1)$q$,'finish event type contradicts outcome'),
  ($q$select pg_temp.new_run(33);select pg_temp.start(33,'supabase_project');select pg_temp.finish(33,'supabase_project','succeeded',ref=>'p33',region=>'eu-north-1');
    select pg_temp.start(33,'database_schema');select pg_temp.finish(33,'database_schema','succeeded');select pg_temp.start(33,'application_deployment');
    select pg_temp.finish(33,'application_deployment','succeeded',url=>'https://p33.example.se');select pg_temp.start(33,'initial_administrator');
    select pg_temp.finish(33,'initial_administrator','succeeded');select pg_temp.start(33,'installation_verification');
    update public.provisioning_runs set revision=revision+1,status='succeeded',finished_at=clock_timestamp() where id=pg_temp.r(33);
    update public.provisioning_run_steps set status='succeeded',completed_at=clock_timestamp() where run_id=pg_temp.r(33) and step_key='installation_verification';
    update public.provisioning_step_attempts set outcome='succeeded',finished_at=clock_timestamp(),finished_revision=pg_temp.rev(33) where run_id=pg_temp.r(33) and outcome is null;
    select pg_temp.audit(33,'step_succeeded','installation_verification',1)$q$,'final step must be run_succeeded'),
  ($q$select pg_temp.new_run(34);update public.provisioning_runs set revision=2,status='in_progress' where id=pg_temp.r(34);
    update public.provisioning_run_steps set status='in_progress',attempt_count=1 where run_id=pg_temp.r(34) and step_key='supabase_project';
    insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision) values(pg_temp.r(34),'supabase_project',1,2);
    select pg_temp.audit(34,'step_started','supabase_project',2)$q$,'event points at a missing attempt'),
  ($q$select pg_temp.new_run(35);select pg_temp.cancel(35);update public.provisioning_audit_events set run_id=run_id where false;
    insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after) values(pg_temp.r(35),'step_started','supabase_project',1,'00000000-0000-4000-8000-000000000051',2,3)$q$,'event after cancellation'),
  ($q$select pg_temp.new_run(36);select pg_temp.start(36,'supabase_project');select pg_temp.finish(36,'supabase_project','failed','timeout');
    update public.provisioning_runs set status='in_progress' where id=pg_temp.r(36)$q$,'run in_progress after failed attempt')
) as cases(q,label);
set constraints all deferred;

-- Catalog v1 is exactly five ordered steps.
select results_eq($q$select step_key,position::integer from public.provisioning_run_steps where run_id=pg_temp.r(1) order by position$q$,
  $q$values ('supabase_project'::text,1),('database_schema',2),('application_deployment',3),('initial_administrator',4),('installation_verification',5)$q$,
  'catalog v1 has the initial administrator step before verification');
select throws_ok($q$insert into public.provisioning_run_steps(run_id,step_key,position) values(pg_temp.r(1),'initial_administrator',5)$q$,'23514',null,'initial administrator only at position 4');
select throws_ok($q$insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after) values(pg_temp.r(1),'run_succeeded','initial_administrator',1,'00000000-0000-4000-8000-000000000051',1,2)$q$,'23514',null,'run_succeeded only for verification');

-- Immediate constraints.
select throws_ok(q,code::char(5),null,label) from (values
  ($q$insert into public.provisioning_runs(installation_id,status,created_by,updated_by) values(pg_temp.i(20),'done','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','unknown run status'),
  ($q$insert into public.provisioning_runs(installation_id,catalog_version,created_by,updated_by) values(pg_temp.i(20),2,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','catalog version 2'),
  ($q$insert into public.provisioning_runs(installation_id,blocked_reason,created_by,updated_by) values(pg_temp.i(20),'license_draft','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','blocked reason without blocked'),
  ($q$insert into public.provisioning_runs(installation_id,status,blocked_reason,created_by,updated_by) values(pg_temp.i(20),'blocked','license_bad','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','unknown blocked reason'),
  ($q$insert into public.provisioning_runs(installation_id,status,created_by,updated_by) values(pg_temp.i(20),'cancelled','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','terminal without finished_at'),
  ($q$insert into public.provisioning_runs(installation_id,status,finished_at,result_supabase_project_ref,result_hosting_region,created_by,updated_by) values(pg_temp.i(20),'succeeded',now(),'p','eu','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','succeeded without url'),
  ($q$insert into public.provisioning_runs(installation_id,result_supabase_project_ref,created_by,updated_by) values(pg_temp.i(20),'Proj','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','uppercase project ref'),
  ($q$insert into public.provisioning_runs(installation_id,result_hosting_region,created_by,updated_by) values(pg_temp.i(20),'eu north','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','region with space'),
  ($q$insert into public.provisioning_runs(installation_id,result_application_url,created_by,updated_by) values(pg_temp.i(20),'http://app.example.se','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','non-https url'),
  ($q$insert into public.provisioning_runs(installation_id,result_application_url,created_by,updated_by) values(pg_temp.i(20),'https://user:pw@app.example.se','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23514','url with credentials'),
  ($q$insert into public.provisioning_runs(installation_id,created_by,updated_by) values(pg_temp.i(2),'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23505','second open run for one installation'),
  ($q$insert into public.provisioning_runs(installation_id,created_by,updated_by) values('20000000-0000-4000-8000-0000000000ff','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051')$q$,'23503','unknown installation'),
  ($q$insert into public.provisioning_run_steps(run_id,step_key,position) values(pg_temp.r(1),'extra_step',5)$q$,'23514','step outside catalog'),
  ($q$update public.provisioning_run_steps set status='done' where run_id=pg_temp.r(1) and step_key='supabase_project'$q$,'23514','unknown step status'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision) values(pg_temp.r(1),'supabase_project',1,1,'failed',now(),2)$q$,'23514','failed without category'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision,blocked_reason,note) values(pg_temp.r(1),'supabase_project',1,1,'blocked',now(),1,'license_draft','note')$q$,'23514','note on blocked attempt'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_at,started_revision,outcome,finished_at,finished_revision,blocked_reason) values(pg_temp.r(1),'supabase_project',1,now(),1,'blocked',now()+interval '1 second',1,'license_draft')$q$,'23514','blocked attempt with duration'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision,failure_category,note) values(pg_temp.r(1),'supabase_project',1,1,'failed',now(),2,'timeout',e'tab\there')$q$,'23514','note with tab'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision,failure_category,note) values(pg_temp.r(1),'supabase_project',1,1,'failed',now(),2,'timeout',' padded')$q$,'23514','untrimmed note'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision,failure_category,note) values(pg_temp.r(1),'supabase_project',1,1,'failed',now(),2,'timeout',repeat('x',501))$q$,'23514','501 character note'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision,outcome,finished_at,finished_revision,failure_category) values(pg_temp.r(1),'supabase_project',1,1,'failed',now(),2,'unknown')$q$,'23514','unknown failure category'),
  ($q$insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_revision) values(pg_temp.r(2),'database_schema',1,9)$q$,'23505','second open attempt in a run'),
  ($q$insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_after) values(pg_temp.r(1),'run_requested','supabase_project',1,'00000000-0000-4000-8000-000000000051',1)$q$,'23514','run event with step'),
  ($q$insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,revision_before,revision_after) values(pg_temp.r(1),'step_started','00000000-0000-4000-8000-000000000051',1,2)$q$,'23514','step event without step'),
  ($q$insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after) values(pg_temp.r(1),'run_succeeded','database_schema',1,'00000000-0000-4000-8000-000000000051',1,2)$q$,'23514','run_succeeded on non-final step'),
  ($q$insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,revision_before,revision_after) values(pg_temp.r(1),'step_started','supabase_project',1,'00000000-0000-4000-8000-000000000051',1,3)$q$,'23514','revision gap')
) as cases(q,code,label);
select lives_ok($q$select pg_temp.new_run(37);select pg_temp.start(37,'supabase_project');select pg_temp.finish(37,'supabase_project','failed','other',repeat('å',500));set constraints all immediate$q$,'500 code point note accepted');
set constraints all deferred;

-- Structural immutability (55000), including for privileged DML.
select throws_ok(q,'55000',null,label) from (values
  ($q$delete from public.provisioning_runs where id=pg_temp.r(1)$q$,'delete run'),
  ($q$truncate public.provisioning_runs cascade$q$,'truncate runs'),
  ($q$update public.provisioning_runs set installation_id=pg_temp.i(21) where id=pg_temp.r(1)$q$,'change installation'),
  ($q$update public.provisioning_runs set created_by='00000000-0000-4000-8000-000000000099' where id=pg_temp.r(1)$q$,'change creator'),
  ($q$update public.provisioning_runs set result_supabase_project_ref='other' where id=pg_temp.r(4)$q$,'change recorded result'),
  ($q$update public.provisioning_runs set updated_at=updated_at where id=pg_temp.r(5)$q$,'touch succeeded run'),
  ($q$update public.provisioning_runs set updated_at=updated_at where id=pg_temp.r(6)$q$,'touch cancelled run'),
  ($q$delete from public.provisioning_run_steps where run_id=pg_temp.r(1)$q$,'delete steps'),
  ($q$truncate public.provisioning_run_steps cascade$q$,'truncate steps'),
  ($q$update public.provisioning_run_steps set position=position where run_id=pg_temp.r(4) and step_key='supabase_project'$q$,'touch succeeded step'),
  ($q$update public.provisioning_run_steps set attempt_count=0 where run_id=pg_temp.r(2) and step_key='supabase_project'$q$,'decrease attempt count'),
  ($q$delete from public.provisioning_step_attempts where run_id=pg_temp.r(4)$q$,'delete attempts'),
  ($q$truncate public.provisioning_step_attempts$q$,'truncate attempts'),
  ($q$update public.provisioning_step_attempts set note='changed' where run_id=pg_temp.r(4) and attempt_number=1$q$,'edit finalized attempt'),
  ($q$update public.provisioning_step_attempts set attempt_number=5 where run_id=pg_temp.r(2)$q$,'renumber open attempt'),
  ($q$update public.provisioning_step_attempts set started_at=now() where run_id=pg_temp.r(2)$q$,'restart open attempt without outcome'),
  ($q$delete from public.provisioning_audit_events where run_id=pg_temp.r(1)$q$,'delete audit'),
  ($q$update public.provisioning_audit_events set correlation_id=null where run_id=pg_temp.r(1)$q$,'update audit'),
  ($q$truncate public.provisioning_audit_events$q$,'truncate audit')
) as cases(q,label);
select throws_ok($q$delete from public.installations where id=pg_temp.i(1)$q$,'23503',null,'installation with runs cannot be deleted');

-- Committed history is unchanged by all rejected attempts.
select is((select count(*)::integer from public.provisioning_runs),10,'only the ten valid runs exist');
select results_eq($q$select revision from public.provisioning_runs where id=pg_temp.r(5)$q$,$q$values (11::bigint)$q$,'full run has eleven audited revisions');
select * from finish();
rollback;
