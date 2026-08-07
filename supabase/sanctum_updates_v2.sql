-- Sancturm updates are about the platform itself, not any one branch —
-- drop the branch scoping entirely, and lock writes to admin only
-- (no CR access at all, regardless of which policy is currently live).
drop policy if exists "CR manages own branch" on sanctum_updates;
drop policy if exists "CR or admin manages" on sanctum_updates;
drop policy if exists "Admin only manages" on sanctum_updates;
create policy "Admin only manages" on sanctum_updates for all
  using (exists (select 1 from admins where auth_user_id = auth.uid()))
  with check (exists (select 1 from admins where auth_user_id = auth.uid()));

alter table sanctum_updates drop column branch_id;

-- Same dual-mode shape as notices: either an uploaded PDF (pdf_url)
-- or typed-in-app text (body) — exactly one of the two per row.
alter table sanctum_updates alter column body drop not null;
alter table sanctum_updates add column pdf_url text;
alter table sanctum_updates add constraint sanctum_updates_content_check check (pdf_url is not null or body is not null);
