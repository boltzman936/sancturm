begin;

alter table resources add column legacy_shared boolean not null default false;

create table subject_structure_config (
  id boolean primary key default true,
  interchange_active boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint subject_structure_config_singleton check (id)
);
insert into subject_structure_config (id, interchange_active) values (true, false);
alter table subject_structure_config enable row level security;
create policy "Public read" on subject_structure_config for select using (true);

commit;
