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
select has_table('public','license_terms_versions','license_terms_versions exists');
select is((select array_agg(attname::text order by attnum) from pg_attribute where attrelid='public.license_terms_versions'::regclass and attnum>0 and not attisdropped),array['license_id','version','introduced_at_revision','plan_key','plan_version','plan_display_label','max_active_users','valid_from','valid_until']::text[],'exact column order');
select col_type_is('public','license_terms_versions','license_id','uuid','license_id type');
select col_not_null('public','license_terms_versions','license_id','license_id nullability');
select col_hasnt_default('public','license_terms_versions','license_id','license_id has no default');
select col_type_is('public','license_terms_versions','version','bigint','version type');
select col_not_null('public','license_terms_versions','version','version nullability');
select col_hasnt_default('public','license_terms_versions','version','version has no default');
select col_type_is('public','license_terms_versions','introduced_at_revision','bigint','introduced_at_revision type');
select col_not_null('public','license_terms_versions','introduced_at_revision','introduced_at_revision nullability');
select col_hasnt_default('public','license_terms_versions','introduced_at_revision','introduced_at_revision has no default');
select col_type_is('public','license_terms_versions','plan_key','text','plan_key type');
select col_not_null('public','license_terms_versions','plan_key','plan_key nullability');
select col_hasnt_default('public','license_terms_versions','plan_key','plan_key has no default');
select col_type_is('public','license_terms_versions','plan_version','integer','plan_version type');
select col_not_null('public','license_terms_versions','plan_version','plan_version nullability');
select col_hasnt_default('public','license_terms_versions','plan_version','plan_version has no default');
select col_type_is('public','license_terms_versions','plan_display_label','text','plan_display_label type');
select col_not_null('public','license_terms_versions','plan_display_label','plan_display_label nullability');
select col_hasnt_default('public','license_terms_versions','plan_display_label','plan_display_label has no default');
select col_type_is('public','license_terms_versions','max_active_users','integer','max_active_users type');
select col_not_null('public','license_terms_versions','max_active_users','max_active_users nullability');
select col_hasnt_default('public','license_terms_versions','max_active_users','max_active_users has no default');
select col_type_is('public','license_terms_versions','valid_from','timestamp with time zone','valid_from type');
select col_not_null('public','license_terms_versions','valid_from','valid_from nullability');
select col_hasnt_default('public','license_terms_versions','valid_from','valid_from has no default');
select col_type_is('public','license_terms_versions','valid_until','timestamp with time zone','valid_until type');
select col_is_null('public','license_terms_versions','valid_until','valid_until nullability');
select col_hasnt_default('public','license_terms_versions','valid_until','valid_until has no default');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='mini',plan_display_label='Mini',max_active_users=24 where license_id='20000000-0000-4000-8000-000000000001'$q$),'00000','mini snapshot');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='standard',plan_display_label='Standard',max_active_users=49 where license_id='20000000-0000-4000-8000-000000000001'$q$),'00000','standard snapshot');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='stor',plan_display_label='Stor',max_active_users=100 where license_id='20000000-0000-4000-8000-000000000001'$q$),'00000','stor snapshot');
select is(pg_temp.attempt($q$update public.license_terms_versions set version=0 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','version=0');
select is(pg_temp.attempt($q$update public.license_terms_versions set version=-1 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','version=-1');
select is(pg_temp.attempt($q$update public.license_terms_versions set introduced_at_revision=0 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','introduced_at_revision=0');
select is(pg_temp.attempt($q$update public.license_terms_versions set introduced_at_revision=-1 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','introduced_at_revision=-1');
select is(pg_temp.attempt($q$update public.license_terms_versions set version=2 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','version=2');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_version=0 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_version=0');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_version=2 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_version=2');
select is(pg_temp.attempt($q$update public.license_terms_versions set max_active_users=0 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','max_active_users=0');
select is(pg_temp.attempt($q$update public.license_terms_versions set max_active_users=-1 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','max_active_users=-1');
select is(pg_temp.attempt($q$update public.license_terms_versions set max_active_users=25 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','max_active_users=25');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='Mini' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_key=Mini');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key=' mini' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_key= mini');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_key=');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='custom' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_key=custom');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_display_label='mini' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_display_label=mini');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_display_label='Mini ' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_display_label=Mini ');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_display_label='' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_display_label=');
select is(pg_temp.attempt($q$update public.license_terms_versions set plan_key='standard' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','plan_key=standard');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_until=valid_from where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_until=valid_from');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_until=valid_from-interval '1 second' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_until=valid_from-interval 1 second');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_from='infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_from=infinity');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_from='-infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_from=-infinity');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_until='infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_until=infinity');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_until='-infinity' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23514','valid_until=-infinity');
select is(pg_temp.attempt($q$update public.license_terms_versions set valid_until=valid_from+interval '1 second' where license_id='20000000-0000-4000-8000-000000000001'$q$),'00000','strictly later end');
select is(pg_temp.attempt($q$update public.license_terms_versions set introduced_at_revision=2 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23503','missing audit revision');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000002','license_renewed','10000000-0000-4000-8000-000000000099',1,2,array['revision']); update public.license_terms_versions set introduced_at_revision=2 where license_id='20000000-0000-4000-8000-000000000001'$q$),'23503','other license audit cannot satisfy FK');
select is(pg_temp.attempt($q$insert into public.license_terms_versions select * from public.license_terms_versions where license_id='20000000-0000-4000-8000-000000000001'$q$),'23505','terms PK duplicate');
select is(pg_temp.attempt($q$insert into public.license_terms_versions select license_id,2,2,plan_key,plan_version,plan_display_label,max_active_users,valid_from,valid_until from public.license_terms_versions where license_id='20000000-0000-4000-8000-000000000001'; update public.license_terms_versions set introduced_at_revision=2 where license_id='20000000-0000-4000-8000-000000000001' and version=1$q$),'23505','one terms snapshot per revision');
select is(pg_temp.attempt($q$update public.license_terms_versions set license_id='20000000-0000-4000-8000-000000000099' where license_id='20000000-0000-4000-8000-000000000001'$q$),'23503','missing license');
select is(pg_temp.attempt($q$delete from public.license_terms_versions where license_id='20000000-0000-4000-8000-000000000001'$q$),'23503','current terms delete rejected at checkpoint');

select * from finish();
rollback;

