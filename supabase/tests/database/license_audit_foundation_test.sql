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

create function pg_temp.try_audit(overrides jsonb) returns text language plpgsql as $$
declare
  candidate public.license_audit_events;
  later_event boolean;
begin
  begin
    candidate := jsonb_populate_record(null::public.license_audit_events,
      jsonb_build_object('id',gen_random_uuid(),'license_id','20000000-0000-4000-8000-000000000009','event_type','license_created','actor_user_id','10000000-0000-4000-8000-000000000099','occurred_at',current_timestamp,'revision_before',null,'revision_after',1,'changed_fields',array['id'],'correlation_id',null) || overrides);
    later_event := candidate.event_type <> 'license_created';
    insert into public.licenses(id,tenant_id,status,revision,current_terms_version,created_by,updated_by) values
      ('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','terminated',case when later_event then 2 else 1 end,
       case when candidate.event_type in ('license_terms_changed','license_renewed') then 2 else 1 end,'10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099');
    if later_event then
      insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields)
        values ('20000000-0000-4000-8000-000000000009','license_created','10000000-0000-4000-8000-000000000099',1,array['id']);
    end if;
    insert into public.license_audit_events select candidate.*;
    insert into public.license_terms_versions values ('20000000-0000-4000-8000-000000000009',1,1,'mini',1,'Mini',24,'2026-01-01',null);
    if candidate.event_type in ('license_terms_changed','license_renewed') then
      insert into public.license_terms_versions values ('20000000-0000-4000-8000-000000000009',2,2,'mini',1,'Mini',24,'2026-01-01',null);
    end if;
    set constraints all immediate;
    raise exception using errcode='ZX001',message='test rollback';
  exception when sqlstate 'ZX001' then return '00000'; when others then return sqlstate;
  end;
end;
$$;
select is(pg_temp.try_audit('{}'::jsonb),'00000','create');
select is(pg_temp.try_audit('{"event_type":"license_terms_changed","revision_before":1,"revision_after":2}'::jsonb),'00000','license_terms_changed');
select is(pg_temp.try_audit('{"event_type":"license_activated","revision_before":1,"revision_after":2}'::jsonb),'00000','license_activated');
select is(pg_temp.try_audit('{"event_type":"license_suspended","revision_before":1,"revision_after":2}'::jsonb),'00000','license_suspended');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":1,"revision_after":2}'::jsonb),'00000','license_renewed');
select is(pg_temp.try_audit('{"event_type":"license_terminated","revision_before":1,"revision_after":2}'::jsonb),'00000','license_terminated');
select is(pg_temp.try_audit('{"event_type":"unknown"}'::jsonb),'23514','unknown event');
select is(pg_temp.try_audit('{"revision_after":0}'::jsonb),'23514','zero after');
select is(pg_temp.try_audit('{"revision_before":1}'::jsonb),'23514','create before');
select is(pg_temp.try_audit('{"revision_after":2}'::jsonb),'23514','create after');
select is(pg_temp.try_audit('{"occurred_at":"infinity"}'::jsonb),'23514','infinite time');
select is(pg_temp.try_audit('{"occurred_at":"-infinity"}'::jsonb),'23514','infinite time');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":null,"revision_after":2}'::jsonb),'23514','bad revision pair');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":0,"revision_after":1}'::jsonb),'23514','bad revision pair');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":1,"revision_after":3}'::jsonb),'23514','bad revision pair');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":2,"revision_after":2}'::jsonb),'23514','bad revision pair');
select is(pg_temp.try_audit('{"event_type":"license_renewed","revision_before":-1,"revision_after":1}'::jsonb),'23514','bad revision pair');
select is(pg_temp.try_audit('{"actor_user_id":null}'::jsonb),'23502','actor required');
select is(pg_temp.try_audit('{"changed_fields":[]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":[null]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":["id","id"]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":["unknown"]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":["revision","id"]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":[["id","revision"],["id","revision"]]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":["id,tenant_id"]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":[""]}'::jsonb),'23514','bad changed fields');
select is(pg_temp.try_audit('{"changed_fields":["id","status","valid_until","updated_by"]}'::jsonb),'00000','canonical subset');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000001','license_created','10000000-0000-4000-8000-000000000099',1,array['id'])$q$),'23505','audit revision unique');
select is(pg_temp.attempt($q$delete from public.licenses where id='20000000-0000-4000-8000-000000000001'$q$),'23503','license delete restricted');
select * from finish();
rollback;
