begin;
select no_plan();
-- F2E7 recovery scenarios through the real F2E5 RPCs. Only stale attempts are
-- inserted as historical fixtures, because started_at is immutable and a
-- real stale attempt is 24+ hours old.
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);

create function pg_temp.t(n int) returns uuid language sql immutable as $$ select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.i(n int) returns uuid language sql immutable as $$ select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.l(n int) returns uuid language sql immutable as $$ select ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.run(inst int) returns uuid language sql stable security definer as $$
  select id from public.provisioning_runs where installation_id=pg_temp.i(inst) order by created_at desc, id desc limit 1 $$;
create function pg_temp.rev(inst int) returns bigint language sql stable security definer as $$ select revision from public.provisioning_runs where id=pg_temp.run(inst) $$;
create function pg_temp.state(inst int) returns text language sql stable security definer as $$
  select r.status||'|'||coalesce(r.blocked_reason,'-')||'|'||r.revision||'|'||
    (select string_agg(s.status||':'||s.attempt_count,',' order by s.position) from public.provisioning_run_steps s where s.run_id=r.id)
  from public.provisioning_runs r where r.id=pg_temp.run(inst) $$;
create function pg_temp.attempts(inst int) returns text language sql stable security definer as $$
  select string_agg(a.step_key||'#'||a.attempt_number||':'||coalesce(a.outcome,'open'),',' order by a.started_revision)
  from public.provisioning_step_attempts a where a.run_id=pg_temp.run(inst) $$;
create function pg_temp.events(inst int) returns text language sql stable security definer as $$
  select string_agg(e.event_type,',' order by e.revision_after) from public.provisioning_audit_events e where e.run_id=pg_temp.run(inst) $$;
-- A run whose first step was started 30 hours ago and never reported.
create function pg_temp.stale_run(inst int) returns void language plpgsql as $$
declare id uuid := gen_random_uuid(); began timestamptz := clock_timestamp() - interval '30 hours';
begin
  insert into public.provisioning_runs(id,installation_id,status,revision,created_at,created_by,updated_at,updated_by)
  values(id,pg_temp.i(inst),'in_progress',2,began,'00000000-0000-4000-8000-000000000051',began,'00000000-0000-4000-8000-000000000051');
  insert into public.provisioning_run_steps(run_id,step_key,position,status,attempt_count) values
    (id,'supabase_project',1,'in_progress',1),(id,'database_schema',2,'pending',0),(id,'application_deployment',3,'pending',0),
    (id,'initial_administrator',4,'pending',0),(id,'installation_verification',5,'pending',0);
  insert into public.provisioning_step_attempts(run_id,step_key,attempt_number,started_at,started_revision) values(id,'supabase_project',1,began,2);
  insert into public.provisioning_audit_events(run_id,event_type,actor_user_id,occurred_at,revision_after) values(id,'run_requested','00000000-0000-4000-8000-000000000051',began,1);
  insert into public.provisioning_audit_events(run_id,event_type,step_key,attempt_number,actor_user_id,occurred_at,revision_before,revision_after)
  values(id,'step_started','supabase_project',1,'00000000-0000-4000-8000-000000000051',began,1,2);
end $$;

insert into public.tenants(id,category,legal_name,created_by,updated_by)
select pg_temp.t(n),'internal','Recovery tenant '||n,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051' from generate_series(1,2) n;
insert into public.installations(id,tenant_id,installation_code,display_name,environment,created_by,updated_by)
select pg_temp.i(n),pg_temp.t(case when n=9 then 2 else 1 end),'recovery-'||n,'Recovery '||n,'production','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,9) n;
insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by)
select pg_temp.l(n),pg_temp.t(n),'active','2021-01-01','00000000-0000-4000-8000-000000000051','2021-01-01','00000000-0000-4000-8000-000000000051' from generate_series(1,2) n;
insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields)
select pg_temp.l(n),'license_created','00000000-0000-4000-8000-000000000051','2021-01-01',1,array['id','tenant_id','status','revision'] from generate_series(1,2) n;
insert into public.license_terms_versions select pg_temp.l(n),1,1,'mini',1,'Mini',24,'2021-01-01',null from generate_series(1,2) n;
select pg_temp.stale_run(1);
select pg_temp.stale_run(2);
select pg_temp.stale_run(6);
set constraints all immediate;
set constraints all deferred;

set local role authenticated;

-- 1. A stale attempt is visible and is reconciled late as a success.
select is((select string_agg(right(installation_id::text,2),',' order by installation_id) from public.list_provisioning_runs(p_only_stale=>true)),'01,02,06','stale runs listed by the stale-only filter');
select ok((select bool_and(is_stale) from public.get_provisioning_run(pg_temp.run(1)) where open_attempt_number is not null),'detail marks the open stale attempt');
select lives_ok(format('select public.complete_provisioning_step(%L,2,%L,%L,null,%L)',pg_temp.run(1),'projlate','eu-north-1','Projektet fanns, registrerat i efterhand'),'late success reconciliation after 30 hours');
select is(pg_temp.state(1),'in_progress|-|3|succeeded:1,pending:0,pending:0,pending:0,pending:0','reconciled step succeeded');
select is((select count(*)::integer from public.list_provisioning_runs(p_only_stale=>true) where installation_id=pg_temp.i(1)),0,'no longer stale');

-- 2. A stale attempt is reconciled as a failure, then retried fresh.
select lives_ok(format('select public.fail_provisioning_step(%L,2,%L,%L)',pg_temp.run(2),'timeout','Ingen respons från leverantören'),'late failure reconciliation');
select lives_ok(format('select public.start_provisioning_step(%L,3)',pg_temp.run(2)),'manual retry after stale failure');
select is(pg_temp.attempts(2),'supabase_project#1:failed,supabase_project#2:open','retry is a new attempt on the same step');
select ok((select not bool_or(is_stale) from public.get_provisioning_run(pg_temp.run(2))),'fresh retry is not stale');

-- 3. Half-done step: the project was created but the attempt failed; the
--    retry records the same existing project instead of a new one.
select lives_ok(format('select public.fail_provisioning_step(%L,4,%L,%L)',pg_temp.run(2),'provider_error','Svar tappades, projektet kan finnas'),'second attempt reported failed');
select lives_ok(format('select public.start_provisioning_step(%L,5)',pg_temp.run(2)),'third attempt');
select lives_ok(format('select public.complete_provisioning_step(%L,6,%L,%L)',pg_temp.run(2),'projlate','eu-north-1'),'retry records the existing project ref');
select is(pg_temp.attempts(2),'supabase_project#1:failed,supabase_project#2:failed,supabase_project#3:succeeded','contiguous attempts, one success');

-- 4. Outcomes stay recordable when preconditions change mid-step; only the
--    next start is blocked.
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000003')$q$,'run on installation 3');
select lives_ok(format('select public.start_provisioning_step(%L,1)',pg_temp.run(3)),'start while eligible');
select lives_ok($q$select public.suspend_license('40000000-0000-4000-8000-000000000001',1)$q$,'license suspended during the step');
reset role;
update public.tenants set operational_status='paused' where id=pg_temp.t(1);
set local role authenticated;
select lives_ok(format('select public.complete_provisioning_step(%L,2,%L,%L)',pg_temp.run(3),'proj3','eu-north-1'),'completion is still recorded');
select lives_ok(format('select public.start_provisioning_step(%L,3)',pg_temp.run(3)),'next start is evaluated');
select is(pg_temp.state(3),'blocked|tenant_not_available|4|succeeded:1,pending:1,pending:0,pending:0,pending:0','tenant blocks before license');
reset role;
update public.tenants set operational_status='active' where id=pg_temp.t(1);
set local role authenticated;
select lives_ok(format('select public.start_provisioning_step(%L,4)',pg_temp.run(3)),'tenant restored, license still suspended');
select is(pg_temp.state(3),'blocked|license_suspended|5|succeeded:1,pending:2,pending:0,pending:0,pending:0','license block after tenant restored');
select lives_ok($q$select public.activate_license('40000000-0000-4000-8000-000000000001',2)$q$,'license reactivated');
select lives_ok(format('select public.start_provisioning_step(%L,5)',pg_temp.run(3)),'resumes');
select is(pg_temp.state(3),'in_progress|-|6|succeeded:1,in_progress:3,pending:0,pending:0,pending:0','resumed as attempt three');

-- 5. Repeated failures stay contiguous; no automatic retry or cap.
select lives_ok(format('select public.fail_provisioning_step(%L,6,%L);select public.start_provisioning_step(%L,7);select public.fail_provisioning_step(%L,8,%L);select public.start_provisioning_step(%L,9)',
  pg_temp.run(3),'other',pg_temp.run(3),pg_temp.run(3),'timeout',pg_temp.run(3)),'two more failures and a fourth start');
select is(pg_temp.attempts(3),'supabase_project#1:succeeded,database_schema#1:blocked,database_schema#2:blocked,database_schema#3:failed,database_schema#4:failed,database_schema#5:open','blocked and failed attempts share one sequence');
select lives_ok(format('select public.complete_provisioning_step(%L,10)',pg_temp.run(3)),'eventually succeeds');

-- 6. Invalid results never advance the run.
select lives_ok(format('select public.start_provisioning_step(%L,11)',pg_temp.run(3)),'start deployment');
select throws_ok(format('select public.complete_provisioning_step(%L,12,%L,%L,%L)',pg_temp.run(3),'proj9','eu-north-1','https://x.example.se'),'22023','validation_error','deployment cannot change the project ref');
select is(pg_temp.rev(3),12::bigint,'rejected result wrote nothing');
select lives_ok(format('select public.complete_provisioning_step(%L,12,null,null,%L)',pg_temp.run(3),'https://kund3.example.se'),'valid url');
reset role;
select results_eq(format('select result_supabase_project_ref,result_application_url from public.provisioning_runs where id=%L',pg_temp.run(3)),
  $q$values ('proj3'::text,'https://kund3.example.se'::text)$q$,'recorded results unchanged by later steps');
set local role authenticated;

-- 7. A stale run is cancelled; history is kept and the installation can be
--    provisioned again, reusing the same existing project.
select set_config('test.cancelled',pg_temp.run(6)::text,true);
select lives_ok(format('select public.cancel_provisioning_run(%L,2)',pg_temp.run(6)),'cancel the stale run');
reset role;
select results_eq(format('select status,(select outcome from public.provisioning_step_attempts where run_id=r.id) from public.provisioning_runs r where id=%L',current_setting('test.cancelled')),
  $q$values ('cancelled'::text,'cancelled'::text)$q$,'stale attempt closed as cancelled');
set local role authenticated;
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000006')$q$,'new run after cancel');
select lives_ok(format('select public.start_provisioning_step(%L,1);select public.complete_provisioning_step(%L,2,%L,%L)',pg_temp.run(6),pg_temp.run(6),'projlate','eu-north-1'),'new run records the existing project');
select ok(pg_temp.run(6)::text <> current_setting('test.cancelled'),'cancelled run is preserved as history');

-- 8. A run blocked on its first start can be cancelled and replaced.
select lives_ok($q$select public.request_provisioning_run('20000000-0000-4000-8000-000000000009')$q$,'run on tenant 2');
select lives_ok($q$select public.suspend_license('40000000-0000-4000-8000-000000000002',1)$q$,'tenant 2 license suspended');
select lives_ok(format('select public.start_provisioning_step(%L,1);select public.start_provisioning_step(%L,2)',pg_temp.run(9),pg_temp.run(9)),'blocked twice');
select lives_ok(format('select public.cancel_provisioning_run(%L,3)',pg_temp.run(9)),'cancel the blocked run');
select is(pg_temp.events(9),'run_requested,step_blocked,step_blocked,run_cancelled','one audit event per recovery action');

-- Every graph still satisfies the deferred integrity check.
select lives_ok('set constraints all immediate','recovery graphs pass the integrity check');
set constraints all deferred;
select * from finish();
rollback;
