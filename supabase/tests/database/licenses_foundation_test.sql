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
select has_table('public','licenses','licenses exists');
select is((select array_agg(attname::text order by attnum) from pg_attribute where attrelid='public.licenses'::regclass and attnum>0 and not attisdropped),array['id','tenant_id','status','revision','current_terms_version','created_at','created_by','updated_at','updated_by']::text[],'exact column order');
select col_type_is('public','licenses','id','uuid','id type');
select col_not_null('public','licenses','id','id nullability');
select col_default_is('public','licenses','id','gen_random_uuid()' ,'id exact default');
select col_type_is('public','licenses','tenant_id','uuid','tenant_id type');
select col_not_null('public','licenses','tenant_id','tenant_id nullability');
select col_hasnt_default('public','licenses','tenant_id','tenant_id has no default');
select col_type_is('public','licenses','status','text','status type');
select col_not_null('public','licenses','status','status nullability');
select col_default_is('public','licenses','status','draft','status exact default');
select col_type_is('public','licenses','revision','bigint','revision type');
select col_not_null('public','licenses','revision','revision nullability');
select col_default_is('public','licenses','revision','1' ,'revision exact default');
select col_type_is('public','licenses','current_terms_version','bigint','current_terms_version type');
select col_not_null('public','licenses','current_terms_version','current_terms_version nullability');
select col_default_is('public','licenses','current_terms_version','1' ,'current_terms_version exact default');
select col_type_is('public','licenses','created_at','timestamp with time zone','created_at type');
select col_not_null('public','licenses','created_at','created_at nullability');
select col_default_is('public','licenses','created_at','CURRENT_TIMESTAMP' ,'created_at exact default');
select col_type_is('public','licenses','created_by','uuid','created_by type');
select col_not_null('public','licenses','created_by','created_by nullability');
select col_hasnt_default('public','licenses','created_by','created_by has no default');
select col_type_is('public','licenses','updated_at','timestamp with time zone','updated_at type');
select col_not_null('public','licenses','updated_at','updated_at nullability');
select col_default_is('public','licenses','updated_at','CURRENT_TIMESTAMP' ,'updated_at exact default');
select col_type_is('public','licenses','updated_by','uuid','updated_by type');
select col_not_null('public','licenses','updated_by','updated_by nullability');
select col_hasnt_default('public','licenses','updated_by','updated_by has no default');
select is(pg_temp.attempt($q$update public.licenses set status='draft' where id='20000000-0000-4000-8000-000000000001'$q$),'00000','status draft');
select is(pg_temp.attempt($q$update public.licenses set status='active' where id='20000000-0000-4000-8000-000000000001'$q$),'00000','status active');
select is(pg_temp.attempt($q$update public.licenses set status='suspended' where id='20000000-0000-4000-8000-000000000001'$q$),'00000','status suspended');
select is(pg_temp.attempt($q$update public.licenses set status='terminated' where id='20000000-0000-4000-8000-000000000001'$q$),'00000','status terminated');
select is(pg_temp.attempt($q$update public.licenses set status='expired' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid status expired');
select is(pg_temp.attempt($q$update public.licenses set status='' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid status ');
select is(pg_temp.attempt($q$update public.licenses set status=' active' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid status  active');
select is(pg_temp.attempt($q$update public.licenses set status='ACTIVE' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid status ACTIVE');
select is(pg_temp.attempt($q$update public.licenses set status='unknown' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','invalid status unknown');
select is(pg_temp.attempt($q$update public.licenses set revision=0 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','revision=0');
select is(pg_temp.attempt($q$update public.licenses set revision=-1 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','revision=-1');
select is(pg_temp.attempt($q$update public.licenses set current_terms_version=0 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','current_terms_version=0');
select is(pg_temp.attempt($q$update public.licenses set current_terms_version=-1 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','current_terms_version=-1');
select is(pg_temp.attempt($q$update public.licenses set current_terms_version=2 where id='20000000-0000-4000-8000-000000000001'$q$),'23514','current_terms_version=2');
select is(pg_temp.attempt($q$update public.licenses set created_at='infinity' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','created_at=infinity');
select is(pg_temp.attempt($q$update public.licenses set updated_at='-infinity' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','updated_at=-infinity');
select is(pg_temp.attempt($q$update public.licenses set updated_at=created_at-interval '1 second' where id='20000000-0000-4000-8000-000000000001'$q$),'23514','updated_at=created_at-interval 1 second');
select is(pg_temp.attempt($q$update public.licenses set tenant_id='10000000-0000-4000-8000-000000000088' where id='20000000-0000-4000-8000-000000000001'$q$),'23503','missing tenant');
select is(pg_temp.attempt($q$delete from public.tenants where id='10000000-0000-4000-8000-000000000001'$q$),'23503','tenant delete restricted');
select is(pg_temp.attempt($q$update public.licenses set revision=2,current_terms_version=2 where id='20000000-0000-4000-8000-000000000001'$q$),'23503','missing current terms forced at checkpoint');
select is(pg_temp.attempt($q$insert into public.license_audit_events(license_id,event_type,actor_user_id,revision_before,revision_after,changed_fields) values ('20000000-0000-4000-8000-000000000002','license_renewed','10000000-0000-4000-8000-000000000099',1,2,array['revision']); insert into public.license_terms_versions values ('20000000-0000-4000-8000-000000000002',2,2,'mini',1,'Mini',24,'2026-01-01',null); update public.licenses set revision=2,current_terms_version=2 where id='20000000-0000-4000-8000-000000000001'$q$),'23503','other license version cannot satisfy pointer');
select is(pg_temp.attempt($q$update public.licenses set status='draft' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='draft',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','draft plus draft rejected');
select is(pg_temp.attempt($q$update public.licenses set status='draft' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='active',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','draft plus active rejected');
select is(pg_temp.attempt($q$update public.licenses set status='draft' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='suspended',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','draft plus suspended rejected');
select is(pg_temp.attempt($q$update public.licenses set status='active' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='draft',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','active plus draft rejected');
select is(pg_temp.attempt($q$update public.licenses set status='active' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='active',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','active plus active rejected');
select is(pg_temp.attempt($q$update public.licenses set status='active' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='suspended',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','active plus suspended rejected');
select is(pg_temp.attempt($q$update public.licenses set status='suspended' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='draft',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','suspended plus draft rejected');
select is(pg_temp.attempt($q$update public.licenses set status='suspended' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='active',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','suspended plus active rejected');
select is(pg_temp.attempt($q$update public.licenses set status='suspended' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='suspended',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'23505','suspended plus suspended rejected');
select is(pg_temp.attempt($q$update public.licenses set status='terminated'; update public.licenses set tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'00000','multiple terminated per tenant');
select is(pg_temp.attempt($q$update public.licenses set status='terminated' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='draft',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'00000','terminated plus new draft');
select is(pg_temp.attempt($q$update public.licenses set status='terminated' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='active',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'00000','terminated plus new active');
select is(pg_temp.attempt($q$update public.licenses set status='terminated' where id='20000000-0000-4000-8000-000000000001'; update public.licenses set status='suspended',tenant_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002'$q$),'00000','terminated plus new suspended');
select is(pg_temp.attempt($q$insert into public.licenses select * from public.licenses where id='20000000-0000-4000-8000-000000000001'$q$),'23505','license PK duplicate');

select * from finish();
rollback;
