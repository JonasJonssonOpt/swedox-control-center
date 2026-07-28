create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on schema private from service_role;

create function private.get_control_center_owner_bootstrap_status(
  p_owner_user_id uuid
)
returns text
language plpgsql
stable
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
declare
  database_owner_id uuid;
  owner_row_count bigint;
begin
  if p_owner_user_id is null then
    return 'invalid_input';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = p_owner_user_id
  ) then
    return 'auth_user_not_found';
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

  if database_owner_id <> p_owner_user_id then
    return 'owner_mismatch';
  end if;

  return 'ok';
end;
$function$;

create function private.bootstrap_control_center_owner(p_owner_user_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
declare
  bootstrap_status text;
begin
  if p_owner_user_id is null then
    return 'invalid_input';
  end if;

  lock table public.control_center_owner in exclusive mode;

  bootstrap_status :=
    private.get_control_center_owner_bootstrap_status(p_owner_user_id);

  if bootstrap_status = 'ok' then
    return 'already_bootstrapped';
  end if;

  if bootstrap_status <> 'missing_database_owner' then
    return bootstrap_status;
  end if;

  insert into public.control_center_owner (owner_user_id)
  values (p_owner_user_id);

  if private.get_control_center_owner_bootstrap_status(p_owner_user_id) <> 'ok' then
    raise exception using
      errcode = 'P0001',
      message = 'owner_bootstrap_verification_failed';
  end if;

  return 'bootstrapped';
end;
$function$;

alter function private.get_control_center_owner_bootstrap_status(uuid)
owner to postgres;
alter function private.bootstrap_control_center_owner(uuid)
owner to postgres;

revoke execute on function private.get_control_center_owner_bootstrap_status(uuid)
from public;
revoke execute on function private.get_control_center_owner_bootstrap_status(uuid)
from anon;
revoke execute on function private.get_control_center_owner_bootstrap_status(uuid)
from authenticated;
revoke execute on function private.get_control_center_owner_bootstrap_status(uuid)
from service_role;

revoke execute on function private.bootstrap_control_center_owner(uuid)
from public;
revoke execute on function private.bootstrap_control_center_owner(uuid)
from anon;
revoke execute on function private.bootstrap_control_center_owner(uuid)
from authenticated;
revoke execute on function private.bootstrap_control_center_owner(uuid)
from service_role;

comment on function private.bootstrap_control_center_owner(uuid) is
  'Administrative, idempotent owner bootstrap. Callable only by the postgres database administrator.';
comment on function private.get_control_center_owner_bootstrap_status(uuid) is
  'Administrative owner bootstrap verification without identity disclosure.';
