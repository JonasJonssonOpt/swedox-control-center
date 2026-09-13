begin;

-- Fixed order; prevent concurrent writes between preflight and installation.
lock table public.licenses, public.license_terms_versions, public.license_audit_events
  in share row exclusive mode;

-- Read-only preflight: abort on existing corruption; never repair or skip it.
do $preflight$
declare
  license_row public.licenses%rowtype;
begin
  for license_row in select * from public.licenses order by id loop
    -- Positive unique integers with count=max=N are exactly 1..N.
    if (select count(*) from public.license_audit_events where license_id=license_row.id) <> license_row.revision
      or (select max(revision_after) from public.license_audit_events where license_id=license_row.id) is distinct from license_row.revision
      or (select count(*) from public.license_terms_versions where license_id=license_row.id) <> license_row.current_terms_version
      or (select max(version) from public.license_terms_versions where license_id=license_row.id) is distinct from license_row.current_terms_version
      or not exists (select 1 from public.license_terms_versions where license_id=license_row.id and version=1 and introduced_at_revision=1)
      or exists (
        select 1 from (
          select introduced_at_revision, lag(introduced_at_revision) over (order by version) as previous_revision
          from public.license_terms_versions where license_id=license_row.id
        ) ordered_terms where introduced_at_revision <= previous_revision
      )
      or exists (
        select 1 from public.license_audit_events a
        left join public.license_terms_versions t
          on t.license_id=a.license_id and t.introduced_at_revision=a.revision_after
        where a.license_id=license_row.id
          and ((a.event_type in ('license_created','license_terms_changed','license_renewed'))
            is distinct from (t.license_id is not null))
      )
    then
      raise exception using errcode='23514', message='license history integrity violation';
    end if;
  end loop;
end;
$preflight$;

create function public.prevent_license_terms_version_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode='55000', message='license terms versions are append-only';
end;
$function$;

create function public.prevent_license_audit_event_modification()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode='55000', message='license audit events are append-only';
end;
$function$;

create function public.enforce_license_history_integrity()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  target_license_id uuid;
  license_row public.licenses%rowtype;
begin
  if TG_WHEN <> 'AFTER' or TG_LEVEL <> 'ROW' or TG_NARGS <> 0 then
    raise exception using errcode='23514', message='license history integrity violation';
  end if;
  if TG_RELID = 'public.licenses'::regclass and TG_OP in ('INSERT','UPDATE') then
    target_license_id := NEW.id;
  elsif TG_RELID in ('public.license_terms_versions'::regclass, 'public.license_audit_events'::regclass)
    and TG_OP = 'INSERT' then
    target_license_id := NEW.license_id;
  else
    raise exception using errcode='23514', message='license history integrity violation';
  end if;

  -- Re-read final state, not a queued NEW revision. Compatible with FK KEY SHARE.
  select * into license_row from public.licenses where id=target_license_id for no key update;
  if not found then
    raise exception using errcode='23514', message='license history integrity violation';
  end if;
    -- Positive unique integers with count=max=N are exactly 1..N.
    if (select count(*) from public.license_audit_events where license_id=license_row.id) <> license_row.revision
      or (select max(revision_after) from public.license_audit_events where license_id=license_row.id) is distinct from license_row.revision
      or (select count(*) from public.license_terms_versions where license_id=license_row.id) <> license_row.current_terms_version
      or (select max(version) from public.license_terms_versions where license_id=license_row.id) is distinct from license_row.current_terms_version
      or not exists (select 1 from public.license_terms_versions where license_id=license_row.id and version=1 and introduced_at_revision=1)
      or exists (
        select 1 from (
          select introduced_at_revision, lag(introduced_at_revision) over (order by version) as previous_revision
          from public.license_terms_versions where license_id=license_row.id
        ) ordered_terms where introduced_at_revision <= previous_revision
      )
      or exists (
        select 1 from public.license_audit_events a
        left join public.license_terms_versions t
          on t.license_id=a.license_id and t.introduced_at_revision=a.revision_after
        where a.license_id=license_row.id
          and ((a.event_type in ('license_created','license_terms_changed','license_renewed'))
            is distinct from (t.license_id is not null))
      )
    then
      raise exception using errcode='23514', message='license history integrity violation';
    end if;
  return null;
end;
$function$;

alter function public.prevent_license_terms_version_modification() owner to postgres;
revoke all privileges on function public.prevent_license_terms_version_modification() from public, anon, authenticated, service_role;
alter function public.prevent_license_audit_event_modification() owner to postgres;
revoke all privileges on function public.prevent_license_audit_event_modification() from public, anon, authenticated, service_role;
alter function public.enforce_license_history_integrity() owner to postgres;
revoke all privileges on function public.enforce_license_history_integrity() from public, anon, authenticated, service_role;

create trigger trg_license_terms_versions_append_only
before update or delete on public.license_terms_versions
for each row execute function public.prevent_license_terms_version_modification();

create trigger trg_license_terms_versions_prevent_truncate
before truncate on public.license_terms_versions
for each statement execute function public.prevent_license_terms_version_modification();

create trigger trg_license_audit_events_append_only
before update or delete on public.license_audit_events
for each row execute function public.prevent_license_audit_event_modification();

create trigger trg_license_audit_events_prevent_truncate
before truncate on public.license_audit_events
for each statement execute function public.prevent_license_audit_event_modification();

create constraint trigger trg_licenses_history_integrity
after insert or update on public.licenses
deferrable initially deferred
for each row execute function public.enforce_license_history_integrity();

create constraint trigger trg_license_terms_versions_history_integrity
after insert on public.license_terms_versions
deferrable initially deferred
for each row execute function public.enforce_license_history_integrity();

create constraint trigger trg_license_audit_events_history_integrity
after insert on public.license_audit_events
deferrable initially deferred
for each row execute function public.enforce_license_history_integrity();

comment on function public.prevent_license_terms_version_modification() is
  'Blocks ordinary UPDATE/DELETE/TRUNCATE, including privileged DML. Does not prevent administrative DDL overrides.';
comment on function public.prevent_license_audit_event_modification() is
  'Blocks ordinary UPDATE/DELETE/TRUNCATE, including privileged DML. No actor or no-op exceptions.';
comment on function public.enforce_license_history_integrity() is
  'Deferred final-state structural check with parent NO KEY UPDATE lock. No business transitions, actor checks, writes, or repair. No direct API execution.';
comment on table public.license_terms_versions is
  'Append-only technical history. Deferred contiguous versions, latest pointer and audit-event linkage. Business mutation semantics belong to F2D5.';
comment on table public.license_audit_events is
  'Append-only metadata audit. Deferred contiguous revision history matching licenses.revision. Direct reads and writes remain closed.';
comment on column public.licenses.revision is
  'Positive revision equals final contiguous audit maximum. Per-operation +1, no-op and expected revision belong to F2D5.';

commit;
