-- System-level toggle for 1st-Year Sem 2's subject structure —
-- Anurag-only, one-click, reversible. Single-row config table (same
-- "boolean primary key default true check (id)" singleton pattern as
-- add_batches.sql would use if it needed one), not a new backend
-- system: one flag, checked wherever a (branch, 1st-Year-Sem-2)
-- subject list gets resolved (see src/features/resources/
-- subjectInterchange.ts's resolveSubjectBranchName — the single
-- source of truth for the actual swap logic, used identically by
-- useSubjects on the client and uploadResourceDirectAllBranches on
-- the server, so the rule can't drift between browsing and uploading).
--
-- Deliberately does NOT touch resources.branch_id or its RLS scoping
-- at all — "interchange" means which SUBJECT LIST a branch uses for
-- Sem 2, not which branch a resource belongs to. A Core CR's Sem 2
-- upload while interchanged is still genuinely a Core resource, just
-- filed under a subject pulled from AIDS's Sem 2 list instead of
-- Core's own (currently empty) one — so this migration needs no RLS
-- changes on resources/subjects at all, only a new config table.
create table subject_structure_config (
  id boolean primary key default true check (id),
  interchange_active boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into subject_structure_config (id) values (true);

alter table subject_structure_config enable row level security;

create policy "Public read" on subject_structure_config for select using (true);

create policy "Admin only updates" on subject_structure_config for update
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));
