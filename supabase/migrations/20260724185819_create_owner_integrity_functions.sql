create function public.get_owner_integrity_status()
returns text
language plpgsql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  authenticated_user_id uuid;
  database_owner_id uuid;
  owner_row_count bigint;
begin
  authenticated_user_id := auth.uid();

  -- Unauthenticated execution must not reveal whether the singleton exists.
  if authenticated_user_id is null then
    return 'unauthenticated';
  end if;

  select count(*)
  into owner_row_count
  from public.control_center_owner;

  if owner_row_count = 0 then
    return 'missing_database_owner';
  end if;

  if owner_row_count <> 1 then
    return 'invalid_database_owner_state';
  end if;

  select owner_user_id
  into database_owner_id
  from public.control_center_owner;

  if database_owner_id is null then
    return 'invalid_database_owner_state';
  end if;

  if authenticated_user_id = database_owner_id then
    return 'ok';
  end if;

  return 'authenticated_user_mismatch';
end;
$function$;

comment on function public.get_owner_integrity_status() is
  'Returns only a categorical owner-integrity status; it never exposes owner identity or singleton data.';

revoke execute on function public.get_owner_integrity_status() from public;
revoke execute on function public.get_owner_integrity_status() from anon;
revoke execute on function public.get_owner_integrity_status() from service_role;
grant execute on function public.get_owner_integrity_status() to authenticated;
