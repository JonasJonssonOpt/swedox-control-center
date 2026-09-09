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

-- Test-only subtransaction: always roll back the attempted change, including success.
create function pg_temp.attempt(statement text) returns text language plpgsql as $$
begin
  begin
    execute statement;
    set constraints all immediate;
    raise exception using errcode = 'ZX001', message = 'test success rollback';
  exception
    when sqlstate 'ZX001' then return '00000';
    when others then return sqlstate;
  end;
end;
$$;
select has_table('public','license_audit_events','license_audit_events exists');
select is((select array_agg(attname::text order by attnum) from pg_attribute where attrelid='public.license_audit_events'::regclass and attnum>0 and not attisdropped),array['id','license_id','event_type','actor_user_id','occurred_at','revision_before','revision_after','changed_fields','correlation_id']::text[],'exact column order');
select col_type_is('public','license_audit_events','id','uuid','id type');
select col_not_null('public','license_audit_events','id','id nullability');
select col_default_is('public','license_audit_events','id','gen_random_uuid()' ,'id exact default');
select col_type_is('public','license_audit_events','license_id','uuid','license_id type');
select col_not_null('public','license_audit_events','license_id','license_id nullability');
select col_hasnt_default('public','license_audit_events','license_id','license_id has no default');
select col_type_is('public','license_audit_events','event_type','text','event_type type');
select col_not_null('public','license_audit_events','event_type','event_type nullability');
select col_hasnt_default('public','license_audit_events','event_type','event_type has no default');
select col_type_is('public','license_audit_events','actor_user_id','uuid','actor_user_id type');
select col_not_null('public','license_audit_events','actor_user_id','actor_user_id nullability');
select col_hasnt_default('public','license_audit_events','actor_user_id','actor_user_id has no default');
select col_type_is('public','license_audit_events','occurred_at','timestamp with time zone','occurred_at type');
select col_not_null('public','license_audit_events','occurred_at','occurred_at nullability');
select col_default_is('public','license_audit_events','occurred_at','CURRENT_TIMESTAMP' ,'occurred_at exact default');
select col_type_is('public','license_audit_events','revision_before','bigint','revision_before type');
select col_is_null('public','license_audit_events','revision_before','revision_before nullability');
select col_hasnt_default('public','license_audit_events','revision_before','revision_before has no default');
select col_type_is('public','license_audit_events','revision_after','bigint','revision_after type');
select col_not_null('public','license_audit_events','revision_after','revision_after nullability');
select col_hasnt_default('public','license_audit_events','revision_after','revision_after has no default');
select col_type_is('public','license_audit_events','changed_fields','text[]','changed_fields type');
select col_not_null('public','license_audit_events','changed_fields','changed_fields nullability');
select col_hasnt_default('public','license_audit_events','changed_fields','changed_fields has no default');
select col_type_is('public','license_audit_events','correlation_id','uuid','correlation_id type');
select col_is_null('public','license_audit_events','correlation_id','correlation_id nullability');
select col_hasnt_default('public','license_audit_events','correlation_id','correlation_id has no default');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_terms_changed','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'00000','license_terms_changed');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_activated','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'00000','license_activated');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_suspended','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'00000','license_suspended');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'00000','license_renewed');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_terminated','10000000-0000-4000-8000-000000000099',1,2,array['revision'])$q$),'00000','license_terminated');
select is(pg_temp.attempt($q$update public.license_audit_events set event_type='unknown' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','event_type=unknown');
select is(pg_temp.attempt($q$update public.license_audit_events set revision_after=0 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','revision_after=0');
select is(pg_temp.attempt($q$update public.license_audit_events set revision_before=1 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','revision_before=1');
select is(pg_temp.attempt($q$update public.license_audit_events set revision_after=2 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','revision_after=2');
select is(pg_temp.attempt($q$update public.license_audit_events set occurred_at='infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','occurred_at=infinity');
select is(pg_temp.attempt($q$update public.license_audit_events set occurred_at='-infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','occurred_at=-infinity');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',null,2,array['revision'])$q$),'23514','invalid noncreate revisions null,2');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',0,1,array['revision'])$q$),'23514','invalid noncreate revisions 0,1');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',1,3,array['revision'])$q$),'23514','invalid noncreate revisions 1,3');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',2,2,array['revision'])$q$),'23514','invalid noncreate revisions 2,2');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_renewed','10000000-0000-4000-8000-000000000099',-1,1,array['revision'])$q$),'23514','invalid noncreate revisions -1,1');
select is(pg_temp.attempt($q$update public.license_audit_events set actor_user_id=null where license_id='20000000-0000-4000-8000-000000000001'$q$),'23502','actor mandatory');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array[]::text[] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[]::text[]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array[null]::text[] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[null]::text[]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array['id','id'] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[id,id]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array['unknown'] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[unknown]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array['revision','id'] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[revision,id]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array[['id','revision'],['id','revision']] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[[id,revision],[id,revision]]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array['id,tenant_id'] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[id,tenant_id]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array[''] where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid field array array[]');
select is(pg_temp.attempt($q$update public.license_audit_events set changed_fields=array['id','status','valid_until','updated_by'] where license_id='20000000-0000-4000-8000-000000000001'$q$),'00000','canonical subset');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_created','10000000-0000-4000-8000-000000000099',1,array['id'])$q$),'23505','audit revision unique');
select is(pg_temp.attempt($q$delete from public.licenses where id='20000000-0000-4000-8000-000000000001'$q$),'23503','license delete restricted');

select * from finish();
rollback;

