-- Site-wide maintenance mode — admin-only, one-row singleton config
-- table, same "boolean primary key default true check (id)" pattern
-- as subject_structure_config. `until` is the SOLE source of truth
-- for whether maintenance is active (null = not in maintenance) —
-- deliberately no separate boolean, since deriving "active" as
-- `until is not null and until > now()` everywhere (middleware, the
-- /maintenance page, the admin panel) means an expired-but-not-
-- cleared `until` is automatically treated as inactive with no cron
-- cleanup needed; "take offline" always overwrites with a fresh
-- future value.
create table maintenance_config (
  id boolean primary key default true check (id),
  until timestamptz,
  message text,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into maintenance_config (id) values (true);

alter table maintenance_config enable row level security;

-- Public read — every browser (including anonymous students, and
-- middleware itself using the anon key) needs to check this on every
-- navigation to know whether to redirect to /maintenance.
create policy "Public read" on maintenance_config for select using (true);

create policy "Admin only updates" on maintenance_config for update
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));
