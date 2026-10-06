begin;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000051');
insert into public.control_center_owner(owner_user_id) values('00000000-0000-4000-8000-000000000051');
select set_config('request.jwt.claim','',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000051","aal":"aal2"}',true);

create function pg_temp.t(n integer) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.l(n integer) returns uuid language sql immutable as $$
  select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.i(n integer) returns uuid language sql immutable as $$
  select ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.fx(n integer, tenant integer, st text, created timestamptz, vfrom timestamptz, vuntil timestamptz)
returns void language plpgsql as $$
begin
  insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by)
  values(pg_temp.l(n),pg_temp.t(tenant),st,created,'00000000-0000-4000-8000-000000000051',created,'00000000-0000-4000-8000-000000000051');
  insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields)
  values(pg_temp.l(n),'license_created','00000000-0000-4000-8000-000000000051',created,1,array['id','tenant_id','status','revision']);
  insert into public.license_terms_versions values(pg_temp.l(n),1,1,'mini',1,'Mini',24,vfrom,vuntil);
end;
$$;
-- reason|license suffix|valid_until for one evaluation.
create function pg_temp.e(tenant uuid, installation uuid default null) returns text language sql as $$
  select eligible::text||'|'||reason||'|'||coalesce(right(license_id::text,2),'-')||'|'||coalesce(valid_until::text,'-')
  from public.get_license_provisioning_eligibility(tenant, installation)
$$;

insert into public.tenants(id,category,legal_name,created_by,updated_by)
select pg_temp.t(n),'internal','Eligibility '||n,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'
from generate_series(1,13) n;
update public.tenants set operational_status='paused' where id=pg_temp.t(8);
update public.tenants set archived_at='2024-01-01',archived_by='00000000-0000-4000-8000-000000000051' where id=pg_temp.t(9);

-- Tenant 1: no license history.
select pg_temp.fx(21,2,'terminated','2020-01-01','2020-01-01',null);
select pg_temp.fx(22,2,'terminated','2021-01-01','2021-01-01',null);
select pg_temp.fx(31,3,'terminated','2020-01-01','2020-01-01',null);
select pg_temp.fx(32,3,'active','2021-01-01','2021-01-01',null);
select pg_temp.fx(40,4,'draft','2021-01-01','2021-01-01',null);
select pg_temp.fx(50,5,'suspended','2021-01-01','2021-01-01',null);
select pg_temp.fx(60,6,'active','2021-01-01','2999-01-01',null);
select pg_temp.fx(70,7,'active','2021-01-01','2021-01-01','2022-01-01');
select pg_temp.fx(80,8,'active','2021-01-01','2021-01-01',null);
select pg_temp.fx(90,9,'active','2021-01-01','2021-01-01',null);
select pg_temp.fx(10,10,'active','2021-01-01','2021-01-01','2999-01-01');
select pg_temp.fx(11,11,'suspended','2021-01-01','2021-01-01','2022-01-01');
select pg_temp.fx(12,12,'draft','2021-01-01','2999-01-01',null);
select pg_temp.fx(13,13,'active','2021-01-01','2021-01-01',clock_timestamp()+interval '1 hour');

insert into public.installations(id,tenant_id,installation_code,display_name,environment,administrative_status,archived_at,archived_by,created_by,updated_by) values
(pg_temp.i(1),pg_temp.t(10),'eligible-prod','Eligible prod','production','decommissioned','2024-01-01','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.i(2),pg_temp.t(8),'paused-prod','Paused prod','production','active',null,null,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.i(3),pg_temp.t(1),'missing-prod','Missing prod','production','planned',null,null,'00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');

set local role authenticated;

-- Every reason in the closed set.
select is(pg_temp.e(pg_temp.t(1)),'false|missing_license|-|-','no history is missing_license');
select is(pg_temp.e(pg_temp.t(2)),'false|terminated|22|-','only terminated history returns the newest terminated license');
select is(pg_temp.e(pg_temp.t(3)),'true|eligible|32|-','non-terminated license wins over older terminated history');
select is(pg_temp.e(pg_temp.t(4)),'false|draft|40|-','draft never eligible');
select is(pg_temp.e(pg_temp.t(5)),'false|suspended|50|-','suspended blocks with valid dates');
select is(pg_temp.e(pg_temp.t(6)),'false|not_started|60|-','active before valid_from is not_started');
select is(pg_temp.e(pg_temp.t(7)),'false|expired|70|2022-01-01 00:00:00+00','active after valid_until is expired');
select is(pg_temp.e(pg_temp.t(8)),'false|tenant_unavailable|-|-','paused tenant is unavailable without license disclosure');
select is(pg_temp.e(pg_temp.t(9)),'false|tenant_unavailable|-|-','archived tenant is unavailable');
select is(pg_temp.e(pg_temp.t(10)),'true|eligible|10|2999-01-01 00:00:00+00','active valid finite license is eligible');
select is(pg_temp.e(pg_temp.t(11)),'false|suspended|11|2022-01-01 00:00:00+00','administrative status outranks expiry');
select is(pg_temp.e(pg_temp.t(12)),'false|draft|12|-','draft outranks not_started');
select is(pg_temp.e(pg_temp.t(13)),'true|eligible|13|'||(select valid_until::text from public.license_terms_versions where license_id=pg_temp.l(13)),'valid until the exclusive end');

-- Result shape and metadata.
select results_eq(format('select eligible,reason,license_id,revision,terms_version from public.get_license_provisioning_eligibility(%L)',pg_temp.t(10)),
  format('values (true,%L::text,%L::uuid,1::bigint,1::bigint)','eligible',pg_temp.l(10)),'eligible carries license, revision and terms version');
select results_eq(format('select eligible,reason,license_id,revision,terms_version,valid_until from public.get_license_provisioning_eligibility(%L)',pg_temp.t(1)),
  $q$values (false,'missing_license'::text,null::uuid,null::bigint,null::bigint,null::timestamptz)$q$,'missing_license has null license fields');
select ok((select evaluated_at <= clock_timestamp() from public.get_license_provisioning_eligibility(pg_temp.t(10))),'evaluation time is DB time');
select is((select count(*)::integer from public.get_license_provisioning_eligibility(pg_temp.t(1))),1,'always exactly one row');
select is((select count(*)::integer from public.get_license_provisioning_eligibility(pg_temp.t(8))),1,'unavailable is exactly one row');

-- Installation: identity and immutable tenant relation only.
select is(pg_temp.e(pg_temp.t(10),pg_temp.i(1)),'true|eligible|10|2999-01-01 00:00:00+00','archived decommissioned installation does not affect eligibility');
select is(pg_temp.e(pg_temp.t(10),pg_temp.i(2)),'false|tenant_installation_mismatch|-|-','installation of another tenant is a mismatch');
select is(pg_temp.e(pg_temp.t(8),pg_temp.i(1)),'false|tenant_installation_mismatch|-|-','mismatch outranks tenant unavailability');
select is(pg_temp.e(pg_temp.t(8),pg_temp.i(2)),'false|tenant_unavailable|-|-','matching installation of unavailable tenant');
select is(pg_temp.e(pg_temp.t(1),pg_temp.i(3)),'false|missing_license|-|-','matching installation without license');

-- Lifecycle changes are reflected immediately; nothing is stored.
select lives_ok(format('select public.suspend_license(%L,1);set constraints all immediate',pg_temp.l(10)),'suspend through product RPC');
set constraints all deferred;
select is(pg_temp.e(pg_temp.t(10)),'false|suspended|10|2999-01-01 00:00:00+00','eligibility follows the committed status');
select results_eq(format('select revision from public.get_license_provisioning_eligibility(%L)',pg_temp.t(10)),$q$values (2::bigint)$q$,'eligibility reports the current revision');

-- Input and identity errors are not results.
select throws_ok(q,code::char(5),msg,label) from (values
  ('select * from public.get_license_provisioning_eligibility(null)','22023','validation_error','null tenant'),
  ('select * from public.get_license_provisioning_eligibility(null,null)','22023','validation_error','null tenant with null installation'),
  ($q$select * from public.get_license_provisioning_eligibility('10000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','unknown tenant'),
  ($q$select * from public.get_license_provisioning_eligibility('10000000-0000-4000-8000-0000000000ff','30000000-0000-4000-8000-000000000001')$q$,'P0001','not_found','unknown tenant with known installation'),
  ($q$select * from public.get_license_provisioning_eligibility('10000000-0000-4000-8000-000000000010','30000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','unknown installation')
) as cases(q,code,msg,label);

-- Reads never write.
reset role;
select is((select sum(revision)::integer from public.licenses),15,'eligibility changed no license beyond the explicit suspend');
select is((select count(*)::integer from public.license_audit_events),15,'eligibility wrote no audit');
select * from finish();
rollback;
