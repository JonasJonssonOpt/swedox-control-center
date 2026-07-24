create table public.control_center_owner (
  singleton_key smallint not null default 1,
  owner_user_id uuid not null,
  created_at timestamp with time zone not null default current_timestamp,
  updated_at timestamp with time zone not null default current_timestamp,
  constraint pk_control_center_owner primary key (singleton_key),
  constraint uq_control_center_owner_owner_user_id unique (owner_user_id),
  constraint ck_control_center_owner_singleton_key check (singleton_key = 1),
  constraint fk_control_center_owner_owner_user_id
    foreign key (owner_user_id)
    references auth.users (id)
    on delete restrict,
  constraint ck_control_center_owner_updated_at check (updated_at >= created_at)
);

alter table public.control_center_owner enable row level security;
alter table public.control_center_owner force row level security;

-- The singleton is changed only by a separately approved privileged drift process.
-- No normal API role may access the table directly; a categorical integrity
-- function will provide the future owner check without exposing the stored UUID.
revoke all privileges on table public.control_center_owner from public;
revoke all privileges on table public.control_center_owner from anon;
revoke all privileges on table public.control_center_owner from authenticated;
revoke all privileges on table public.control_center_owner from service_role;
