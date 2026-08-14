-- CR-only notices — visible to CR/admin, hidden from anonymous
-- students. Enforced here, in RLS, not just by the app hiding it in
-- the UI: students never log in, so "not cr_only OR the caller is
-- actually authenticated as CR/admin" is a real, checkable predicate
-- (auth.uid() is null for them, non-null for a signed-in CR/admin) —
-- unlike PYQ sharing (see pyqSharing.ts's comment), this one genuinely
-- can live in RLS, so it does.
alter table notices add column if not exists cr_only boolean not null default false;

drop policy "Public read" on notices;
create policy "Public read" on notices for select
  using (
    not cr_only
    or exists (select 1 from cr_profiles where auth_user_id = auth.uid())
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
