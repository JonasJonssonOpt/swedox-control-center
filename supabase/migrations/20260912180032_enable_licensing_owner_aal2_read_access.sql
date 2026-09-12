begin;

create function public.is_licensing_owner_aal2()
returns boolean
language plpgsql
stable
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  return coalesce(
    auth.uid() is not null
    and public.is_control_center_owner()
    and (auth.jwt() -> 'aal') = '"aal2"'::jsonb,
    false
  );
exception
  -- Malformed request JSON / subject must deny, never provide a fallback.
  -- Operational failures are not swallowed.
  when invalid_text_representation then
    return false;
end;
$function$;

alter function public.is_licensing_owner_aal2() owner to postgres;
comment on function public.is_licensing_owner_aal2() is
  'Licensing-only boolean predicate: existing singleton owner and exact top-level JWT string aal2. Does not replace app integrity or current MFA checks.';

revoke all privileges on function public.is_licensing_owner_aal2() from public, anon, service_role;
grant execute on function public.is_licensing_owner_aal2() to authenticated;

-- Foundation RLS/FORCE RLS remain enabled. Audit remains entirely closed.
grant select on table public.licenses, public.license_terms_versions to authenticated;

create policy licenses_owner_aal2_select
on public.licenses
for select
to authenticated
using (public.is_licensing_owner_aal2());

create policy license_terms_versions_owner_aal2_select
on public.license_terms_versions
for select
to authenticated
using (public.is_licensing_owner_aal2());

comment on policy licenses_owner_aal2_select on public.licenses is
  'Owner+AAL2 read across all license and tenant states; no domain eligibility checks.';
comment on policy license_terms_versions_owner_aal2_select on public.license_terms_versions is
  'Owner+AAL2 read including historical terms. No direct terms writes.';

commit;
