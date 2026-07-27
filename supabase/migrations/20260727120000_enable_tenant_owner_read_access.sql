create function public.is_control_center_owner()
returns boolean
language sql
stable
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    count(*) = 1
    and bool_and(owner.owner_user_id = auth.uid()),
    false
  )
  from public.control_center_owner as owner;
$function$;

comment on function public.is_control_center_owner() is
  'Returns true only when auth.uid() is the single valid Control Center owner; never returns owner identity.';

revoke execute on function public.is_control_center_owner() from public;
revoke execute on function public.is_control_center_owner() from anon;
revoke execute on function public.is_control_center_owner() from service_role;
grant execute on function public.is_control_center_owner() to authenticated;

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

revoke all privileges on table public.tenants from public;
revoke all privileges on table public.tenants from anon;
revoke all privileges on table public.tenants from authenticated;
revoke all privileges on table public.tenants from service_role;
grant select on table public.tenants to authenticated;

create policy tenants_owner_select
on public.tenants
for select
to authenticated
using (public.is_control_center_owner());

comment on policy tenants_owner_select on public.tenants is
  'Allows the authenticated Control Center owner to read all active and archived tenants.';
