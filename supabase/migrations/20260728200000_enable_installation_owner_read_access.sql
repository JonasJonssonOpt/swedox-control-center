alter table public.installations enable row level security;
alter table public.installations force row level security;

revoke all privileges on table public.installations from public;
revoke all privileges on table public.installations from anon;
revoke all privileges on table public.installations from authenticated;
revoke all privileges on table public.installations from service_role;
grant select on table public.installations to authenticated;

create policy installations_owner_select
on public.installations
for select
to authenticated
using (public.is_control_center_owner());

comment on policy installations_owner_select on public.installations is
  'Allows the authenticated Control Center owner to read all active and archived installations across all tenants.';
