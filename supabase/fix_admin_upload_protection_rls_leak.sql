-- Fixes a real bug in protect_admin_uploads_from_cr.sql, confirmed by
-- direct testing: the policies added there checked
-- `uploaded_by_name in (select display_name from admins)` — but that
-- subquery runs under the CALLING user's own row security on
-- `admins`, and admins' SELECT policy (security_hardening.sql) is
-- "your own row only". A CR's auth.uid() never matches an admins row,
-- so the subquery silently returned zero rows for every CR caller,
-- making `in (...)` always false and the "not admin-uploaded" check
-- always true — the protection did nothing. Verified live: a CR test
-- account successfully deleted an admin-uploaded resource after the
-- previous migration was already applied.
--
-- Fix: a SECURITY DEFINER function runs with its owner's privileges,
-- bypassing the caller's RLS on `admins` entirely — the same pattern
-- Postgres/Supabase recommend for exactly this "check a fact about a
-- row in a table you can't otherwise read" situation. This is the
-- ONLY thing this function does; it must never be extended to return
-- more than a boolean, or it becomes its own information-leak (see
-- security_hardening.sql's own admins-recursion war story for why
-- these functions need to stay narrow and be tested as the restricted
-- role, not assumed correct from reading the SQL).
create or replace function public.is_admin_display_name(name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from admins where display_name = name);
$$;

revoke all on function public.is_admin_display_name(text) from public;
grant execute on function public.is_admin_display_name(text) to authenticated, anon;

drop policy "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (
        (
          section = 'pyq'
          and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
        )
        or (
          section = 'notes_lab'
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (
        (
          section = 'pyq'
          and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
        )
        or (
          section = 'notes_lab'
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (
          section = 'pyq'
          and term_id in (select term_id from cr_profiles where auth_user_id = auth.uid())
        )
        or (
          section = 'notes_lab'
          and (branch_id, term_id, batch_id) in (
            select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin updates" on notices;
create policy "CR or admin updates" on notices for update
  using (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy "CR or admin deletes" on notices;
create policy "CR or admin deletes" on notices for delete
  using (
    (
      (branch_id, term_id, batch_id) in (
        select branch_id, term_id, batch_id from cr_profiles where auth_user_id = auth.uid()
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
