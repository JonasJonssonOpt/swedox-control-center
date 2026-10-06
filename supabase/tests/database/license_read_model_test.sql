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
-- Complete created graph inserted as postgres: fixed past times make derived
-- validity deterministic regardless of when the suite runs.
create function pg_temp.fx(n integer, tenant integer, st text, created timestamptz, plan text, vfrom timestamptz, vuntil timestamptz)
returns void language plpgsql as $$
begin
  insert into public.licenses(id,tenant_id,status,created_at,created_by,updated_at,updated_by)
  values(pg_temp.l(n),pg_temp.t(tenant),st,created,'00000000-0000-4000-8000-000000000051',created,'00000000-0000-4000-8000-000000000051');
  insert into public.license_audit_events(license_id,event_type,actor_user_id,occurred_at,revision_after,changed_fields)
  values(pg_temp.l(n),'license_created','00000000-0000-4000-8000-000000000051',created,1,array['id','tenant_id','status','revision']);
  insert into public.license_terms_versions values(pg_temp.l(n),1,1,plan,1,
    case plan when 'mini' then 'Mini' when 'standard' then 'Standard' else 'Stor' end,
    case plan when 'mini' then 24 when 'standard' then 49 else 100 end,vfrom,vuntil);
end;
$$;
-- Ordered two-digit license suffixes of one RPC page.
create function pg_temp.seq(call text) returns text language plpgsql as $$
declare result text;
begin
  execute format('select coalesce(string_agg(right(r.id::text,2),%L order by r.ordinality),%L) from %s with ordinality as r', ',', '', call) into result;
  return result;
end;
$$;

insert into public.tenants(id,category,legal_name,created_by,updated_by) values
(pg_temp.t(1),'internal','Alfa AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.t(2),'internal','Beta 100%_x AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.t(3),'internal','gamma ab','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.t(5),'internal','Epsilon AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051'),
(pg_temp.t(6),'internal','History AB','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000051');
select pg_temp.fx(1,1,'terminated','2020-01-01','mini','2020-01-01','2021-01-01');
select pg_temp.fx(2,1,'active','2021-01-01','standard','2021-01-01',null);
select pg_temp.fx(3,2,'suspended','2022-01-01','stor','2022-01-01','2024-01-01');
select pg_temp.fx(4,3,'draft','2023-01-01','mini','2999-01-01',null);
select pg_temp.fx(5,5,'active','2023-01-01','mini','2023-01-01','2999-01-01');

set local role authenticated;

-- List ordering, terminated visibility and the metadata allowlist.
select is(pg_temp.seq('public.list_licenses()'),'05,04,03,02','default list is created_at DESC, id DESC and hides terminated');
select is(pg_temp.seq('public.list_licenses(p_include_terminated=>true)'),'05,04,03,02,01','includeTerminated shows terminated history last');
select results_eq($q$select tenant_legal_name,status,validity,plan_key,plan_display_label,max_active_users,valid_from,valid_until,revision,current_terms_version from public.list_licenses(p_include_terminated=>true) order by created_at,id$q$,
  $q$values ('Alfa AB'::text,'terminated'::text,'expired'::text,'mini'::text,'Mini'::text,24,'2020-01-01'::timestamptz,'2021-01-01'::timestamptz,1::bigint,1::bigint),
  ('Alfa AB','active','valid','standard','Standard',49,'2021-01-01',null,1,1),
  ('Beta 100%_x AB','suspended','expired','stor','Stor',100,'2022-01-01','2024-01-01',1,1),
  ('gamma ab','draft','not_started','mini','Mini',24,'2999-01-01',null,1,1),
  ('Epsilon AB','active','valid','mini','Mini',24,'2023-01-01','2999-01-01',1,1)$q$,
  'list rows carry current terms and DB-derived validity');
select is((select count(distinct evaluated_at)::integer from public.list_licenses()),1,'one evaluation time per page');
select ok((select bool_and(evaluated_at <= clock_timestamp()) from public.list_licenses()),'first page evaluation time is server issued');
select is((select count(*)::integer from public.list_licenses() where has_more or next_cursor_created_at is not null or next_cursor_id is not null),0,'last page has no cursor');

-- Filters.
select is(pg_temp.seq($q$public.list_licenses(p_status=>'active')$q$),'05,02','status filter');
select is(pg_temp.seq($q$public.list_licenses(p_status=>'draft')$q$),'04','draft filter');
select is(pg_temp.seq($q$public.list_licenses(p_status=>'terminated',p_include_terminated=>true)$q$),'01','terminated filter with includeTerminated');
select throws_ok($q$select * from public.list_licenses(p_status=>'terminated')$q$,'22023','validation_error','terminated status without includeTerminated is contradictory');
select is(pg_temp.seq($q$public.list_licenses(p_validity=>'valid')$q$),'05,02','validity filter valid');
select is(pg_temp.seq($q$public.list_licenses(p_validity=>'expired')$q$),'03','validity filter expired');
select is(pg_temp.seq($q$public.list_licenses(p_validity=>'expired',p_include_terminated=>true)$q$),'03,01','expired includes terminated history only on request');
select is(pg_temp.seq($q$public.list_licenses(p_validity=>'not_started')$q$),'04','validity filter not_started');
select is(pg_temp.seq(format('public.list_licenses(p_tenant_id=>%L,p_include_terminated=>true)',pg_temp.t(1))),'02,01','tenant filter');
select is(pg_temp.seq(format('public.list_licenses(p_tenant_id=>%L)',pg_temp.t(99))),'','unknown tenant filter is an empty page');
select is(pg_temp.seq($q$public.list_licenses(p_status=>'active',p_validity=>'valid',p_tenant_id=>'10000000-0000-4000-8000-000000000005')$q$),'05','combined filters');

-- Search: trimmed, case-insensitive literal substring of legal_name only.
select is(pg_temp.seq($q$public.list_licenses(p_search=>'alfa')$q$),'02','case-insensitive search');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'  GAMMA  ')$q$),'04','search is trimmed');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'%')$q$),'03','percent is literal');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'_')$q$),'03','underscore is literal');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'100%_x')$q$),'03','combined wildcard characters are literal');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'mini')$q$),'','search does not match plan or other metadata');
select is(pg_temp.seq($q$public.list_licenses(p_search=>'   ')$q$),'05,04,03,02','blank search means no search');
select lives_ok(format('select * from public.list_licenses(p_search=>%L)',repeat('a',200)),'200-character search accepted');
select throws_ok(format('select * from public.list_licenses(p_search=>%L)',repeat('a',201)),'22023','validation_error','201-character search rejected');

-- Keyset pagination with limit+1 and a series-bound evaluation time.
select is(pg_temp.seq('public.list_licenses(2)'),'05,04','first page; equal created_at ties break on id DESC');
select results_eq($q$select distinct has_more,next_cursor_created_at,next_cursor_id from public.list_licenses(2)$q$,
  $q$values (true,'2023-01-01'::timestamptz,'20000000-0000-4000-8000-000000000004'::uuid)$q$,'first page cursor is the last returned row');
select set_config('test.evaluated_at',(select max(evaluated_at)::text from public.list_licenses(2)),true);
select is(pg_temp.seq(format('public.list_licenses(2,%L,%L,%L)',current_setting('test.evaluated_at'),'2023-01-01',pg_temp.l(4))),'03,02','continuation page');
select results_eq(format('select distinct has_more,next_cursor_id,evaluated_at from public.list_licenses(2,%L,%L,%L)',current_setting('test.evaluated_at'),'2023-01-01',pg_temp.l(4)),
  format('values (false,null::uuid,%L::timestamptz)',current_setting('test.evaluated_at')),'continuation reuses the series time and ends without cursor');
select is((select count(*)::integer from public.list_licenses(4) where has_more),0,'exact page size has no next page');
select is(pg_temp.seq(format('public.list_licenses(1,%L,%L,%L)',current_setting('test.evaluated_at'),'2023-01-01',pg_temp.l(5))),'04','page size 1 continues at the id tie');
select results_eq(format('select right(id::text,2),validity from public.list_licenses(10,%L,%L,%L)','2023-06-01','2023-01-01',pg_temp.l(5)),
  $q$values ('04'::text,'not_started'::text),('03','valid'),('02','valid')$q$,'continuation derives validity at the series time, not now');
select is(pg_temp.seq(format('public.list_licenses(10,%L,%L,%L,p_status=>%L)','2024-01-01','2023-01-01',pg_temp.l(5),'active')),'02','filters apply to continuation pages');
select lives_ok(format('select * from public.list_licenses(10,%L,%L,%L,p_status=>%L)','2024-01-01','2023-01-01',pg_temp.l(5),'draft'),
  'cursor row may stop matching a mutable filter between pages');

-- Validation: page size, cursor completeness, series time and filter values.
select throws_ok(q,'22023','validation_error',label) from (values
  ('select * from public.list_licenses(0)','page size 0'),
  ('select * from public.list_licenses(101)','page size 101'),
  ('select * from public.list_licenses(null)','null page size'),
  ('select * from public.list_licenses(p_include_terminated=>null)','null includeTerminated'),
  ($q$select * from public.list_licenses(p_status=>'expired')$q$,'derived validity is not a status'),
  ($q$select * from public.list_licenses(p_status=>'Active')$q$,'status is exact'),
  ($q$select * from public.list_licenses(p_validity=>'active')$q$,'unknown validity'),
  ($q$select * from public.list_licenses(2,'2025-01-01',null,'20000000-0000-4000-8000-000000000004')$q$,'cursor id without created_at'),
  ($q$select * from public.list_licenses(2,'2025-01-01','2023-01-01',null)$q$,'cursor created_at without id'),
  ($q$select * from public.list_licenses(2,null,'2023-01-01','20000000-0000-4000-8000-000000000004')$q$,'cursor without evaluation time'),
  ($q$select * from public.list_licenses(2,'2025-01-01')$q$,'evaluation time without cursor'),
  ($q$select * from public.list_licenses(2,clock_timestamp()+interval '1 minute','2023-01-01','20000000-0000-4000-8000-000000000004')$q$,'future evaluation time'),
  ($q$select * from public.list_licenses(2,'infinity','2023-01-01','20000000-0000-4000-8000-000000000004')$q$,'infinite evaluation time'),
  ($q$select * from public.list_licenses(2,'2025-01-01','-infinity','20000000-0000-4000-8000-000000000004')$q$,'infinite cursor time'),
  ($q$select * from public.list_licenses(2,'2025-01-01','2023-01-01 00:00:00.000001','20000000-0000-4000-8000-000000000004')$q$,'cursor time mismatch at microsecond precision'),
  ($q$select * from public.list_licenses(2,'2025-01-01','2023-01-01','20000000-0000-4000-8000-0000000000ff')$q$,'unknown cursor id'),
  ($q$select * from public.list_licenses(2,'2025-01-01','2023-01-01','20000000-0000-4000-8000-000000000004',p_tenant_id=>'10000000-0000-4000-8000-000000000001')$q$,'cursor outside tenant filter'),
  ($q$select * from public.list_licenses(2,'2022-06-01','2023-01-01','20000000-0000-4000-8000-000000000004')$q$,'cursor created after the series time')
) as cases(q,label);

-- Detail.
select results_eq(format('select tenant_id,tenant_legal_name,status,validity,revision,current_terms_version,plan_key,plan_version,plan_display_label,max_active_users,valid_from,valid_until,created_at,updated_at from public.get_license(%L)',pg_temp.l(3)),
  $q$values ('10000000-0000-4000-8000-000000000002'::uuid,'Beta 100%_x AB'::text,'suspended'::text,'expired'::text,1::bigint,1::bigint,'stor'::text,1,'Stor'::text,100,'2022-01-01'::timestamptz,'2024-01-01'::timestamptz,'2022-01-01'::timestamptz,'2022-01-01'::timestamptz)$q$,
  'detail returns identity, current terms and derived validity');
select is((select status||'/'||validity from public.get_license(pg_temp.l(1))),'terminated/expired','terminated history is readable');
select is((select validity from public.get_license(pg_temp.l(4))),'not_started','detail not_started');
select ok((select evaluated_at <= clock_timestamp() from public.get_license(pg_temp.l(2))),'detail evaluation time is DB time');
select is((select count(*)::integer from public.get_license(pg_temp.l(2))),1,'detail is exactly one row');
select throws_ok($q$select * from public.get_license('20000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','unknown license is not_found');
select throws_ok('select * from public.get_license(null)','22023','validation_error','null license id rejected');

-- Terms history and audit through real mutations: three draft terms versions.
select lives_ok($q$select public.create_license('10000000-0000-4000-8000-000000000006','mini');
  select public.change_license_terms((select id from public.licenses where tenant_id='10000000-0000-4000-8000-000000000006'),1,'standard');
  select public.change_license_terms((select id from public.licenses where tenant_id='10000000-0000-4000-8000-000000000006'),2,'stor');
  set constraints all immediate$q$,'history fixture through product RPCs');
set constraints all deferred;
select set_config('test.history',(select id::text from public.licenses where tenant_id=pg_temp.t(6)),true);
select is(pg_temp.seq('public.list_licenses(1)'),right(current_setting('test.history'),2),'new license sorts first by created_at');
select results_eq(format('select version,introduced_at_revision,plan_key,has_more,next_cursor_version from public.list_license_terms_versions(%L,2)',current_setting('test.history')),
  $q$values (3::bigint,3::bigint,'stor'::text,true,2::bigint),(2,2,'standard',true,2)$q$,'terms history version DESC with cursor');
select results_eq(format('select version,plan_key,has_more,next_cursor_version from public.list_license_terms_versions(%L,2,2)',current_setting('test.history')),
  $q$values (1::bigint,'mini'::text,false,null::bigint)$q$,'terms continuation ends without cursor');
select is((select count(*)::integer from public.list_license_terms_versions(current_setting('test.history')::uuid)),3,'default terms page');
select is((select count(*)::integer from public.list_license_terms_versions(current_setting('test.history')::uuid,3) where has_more),0,'exact terms page has no next page');
select ok((select bool_and(license_id = current_setting('test.history')::uuid) from public.list_license_terms_versions(current_setting('test.history')::uuid)),'terms rows are license-bound');
reset role;
select set_config('test.introduced',(select string_agg(occurred_at::text,',' order by revision_after desc) from public.license_audit_events where license_id=current_setting('test.history')::uuid),true);
set local role authenticated;
select is((select string_agg(introduced_at::text,',' order by version desc) from public.list_license_terms_versions(current_setting('test.history')::uuid)),current_setting('test.introduced'),'introduced_at is the audited decision time');
select is((select string_agg(version::text,',') from public.list_license_terms_versions(pg_temp.l(1))),'1','historical terminated terms readable');
select throws_ok(q,code::char(5),msg,label) from (values
  ($q$select * from public.list_license_terms_versions('20000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','terms of unknown license'),
  ('select * from public.list_license_terms_versions(null)','22023','validation_error','terms null license'),
  (format('select * from public.list_license_terms_versions(%L,0)',current_setting('test.history')),'22023','validation_error','terms page size 0'),
  (format('select * from public.list_license_terms_versions(%L,101)',current_setting('test.history')),'22023','validation_error','terms page size 101'),
  (format('select * from public.list_license_terms_versions(%L,null)',current_setting('test.history')),'22023','validation_error','terms null page size'),
  (format('select * from public.list_license_terms_versions(%L,2,4)',current_setting('test.history')),'22023','validation_error','terms unknown cursor version'),
  (format('select * from public.list_license_terms_versions(%L,2,2)',pg_temp.l(1)),'22023','validation_error','terms cursor of another license')
) as cases(q,code,msg,label);

select results_eq(format('select event_type,revision_before,revision_after,changed_fields,has_more from public.list_license_audit_events(%L,2)',current_setting('test.history')),
  $q$values ('license_terms_changed'::text,2::bigint,3::bigint,array['revision','current_terms_version','plan_key','plan_display_label','max_active_users','valid_from','updated_at','updated_by']::text[],true),
  ('license_terms_changed',1,2,array['revision','current_terms_version','plan_key','plan_display_label','max_active_users','valid_from','updated_at','updated_by'],true)$q$,
  'audit newest first with metadata only (draft NULL start moves to each decision time)');
select ok((select bool_and(actor_user_id='00000000-0000-4000-8000-000000000051' and license_id=current_setting('test.history')::uuid) from public.list_license_audit_events(current_setting('test.history')::uuid)),'audit rows are license-bound with internal actor transport');
select set_config('test.audit_at',(select next_cursor_occurred_at::text from public.list_license_audit_events(current_setting('test.history')::uuid,2) limit 1),true);
select set_config('test.audit_id',(select next_cursor_id::text from public.list_license_audit_events(current_setting('test.history')::uuid,2) limit 1),true);
select is((select id from public.list_license_audit_events(current_setting('test.history')::uuid,2) offset 1),
  current_setting('test.audit_id')::uuid,'audit cursor is the last returned row');
select results_eq(format('select event_type,revision_after,has_more,next_cursor_id from public.list_license_audit_events(%L,2,%L,%L)',current_setting('test.history'),current_setting('test.audit_at'),current_setting('test.audit_id')),
  $q$values ('license_created'::text,1::bigint,false,null::uuid)$q$,'audit continuation ends without cursor');
select is((select string_agg(event_type,',') from public.list_license_audit_events(pg_temp.l(1))),'license_created','historical terminated audit readable');
select throws_ok(q,code::char(5),msg,label) from (values
  ($q$select * from public.list_license_audit_events('20000000-0000-4000-8000-0000000000ff')$q$,'P0001','not_found','audit of unknown license'),
  ('select * from public.list_license_audit_events(null)','22023','validation_error','audit null license'),
  (format('select * from public.list_license_audit_events(%L,0)',current_setting('test.history')),'22023','validation_error','audit page size 0'),
  (format('select * from public.list_license_audit_events(%L,101)',current_setting('test.history')),'22023','validation_error','audit page size 101'),
  (format('select * from public.list_license_audit_events(%L,2,%L,null)',current_setting('test.history'),current_setting('test.audit_at')),'22023','validation_error','audit partial cursor'),
  (format('select * from public.list_license_audit_events(%L,2,null,%L)',current_setting('test.history'),current_setting('test.audit_id')),'22023','validation_error','audit partial cursor id'),
  (format('select * from public.list_license_audit_events(%L,2,%L,%L)',pg_temp.l(1),current_setting('test.audit_at'),current_setting('test.audit_id')),'22023','validation_error','audit cursor of another license'),
  (format('select * from public.list_license_audit_events(%L,2,%L,%L)',current_setting('test.history'),'2020-01-01',current_setting('test.audit_id')),'22023','validation_error','audit cursor time mismatch')
) as cases(q,code,msg,label);

-- Reads never write.
reset role;
select results_eq($q$select count(*)::integer,sum(revision)::integer from public.licenses$q$,$q$values (6,8)$q$,'reads changed no license');
select is((select count(*)::integer from public.license_audit_events),8,'reads wrote no audit');
select is((select count(*)::integer from public.license_terms_versions),8,'reads wrote no terms');
select * from finish();
rollback;
