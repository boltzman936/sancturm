-- Fixes a real gap introduced by expand_branch_hierarchy.sql: the PYQ
-- carve-out in resources' RLS policies matches ONLY on term_id
-- ("section = 'pyq' and term_id in (select term_id from cr_profiles
-- where auth_user_id = auth.uid())"), with no branch check at all.
-- That was safe before this migration, because "branch" and
-- "specialization" were the same thing — the only entities sharing a
-- term_id were CSE's own Core/AIML/AIDS, and letting them freely edit
-- each other's PYQs cross-branch was the intended pooling design.
--
-- Now that real branches exist, this same predicate would let e.g. a
-- Civil CR edit or delete a CSE PYQ, or a Mechanical CR touch a Civil
-- PYQ — anyone sharing a term_id, regardless of branch. Never actually
-- exploitable in practice yet (only CSE has real content and CR
-- accounts today), but wrong now that the schema allows it.
--
-- Fix: add a branch_id match to the PYQ carve-out, matching the exact
-- (branch_id, specialization_id) fix pattern from
-- expand_branch_hierarchy.sql. Deliberately still does NOT match
-- specialization_id — that's what preserves the actual intended
-- behavior (any CSE specialization's CR can manage any other CSE
-- specialization's PYQ within the same term), while now correctly
-- requiring the same real branch.

begin;

drop policy if exists "Public read approved or own/admin" on resources;
create policy "Public read approved or own/admin" on resources for select
  using (
    status = 'approved'
    or (
      section = 'pyq'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.term_id = resources.term_id
      )
    )
    or (
      section = 'notes_lab'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.specialization_id is not distinct from resources.specialization_id
          and cp.term_id = resources.term_id
          and cp.batch_id = resources.batch_id
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin inserts" on resources;
create policy "CR or admin inserts" on resources for insert
  with check (
    (
      section = 'pyq'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.term_id = resources.term_id
      )
    )
    or (
      section = 'notes_lab'
      and exists (
        select 1 from cr_profiles cp
        where cp.auth_user_id = auth.uid()
          and cp.branch_id = resources.branch_id
          and cp.specialization_id is not distinct from resources.specialization_id
          and cp.term_id = resources.term_id
          and cp.batch_id = resources.batch_id
      )
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin updates" on resources;
create policy "CR or admin updates" on resources for update
  using (
    (
      (
        (
          section = 'pyq'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.term_id = resources.term_id
          )
        )
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
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
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.term_id = resources.term_id
          )
        )
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

drop policy if exists "CR or admin deletes" on resources;
create policy "CR or admin deletes" on resources for delete
  using (
    (
      (
        (
          section = 'pyq'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.term_id = resources.term_id
          )
        )
        or (
          section = 'notes_lab'
          and exists (
            select 1 from cr_profiles cp
            where cp.auth_user_id = auth.uid()
              and cp.branch_id = resources.branch_id
              and cp.specialization_id is not distinct from resources.specialization_id
              and cp.term_id = resources.term_id
              and cp.batch_id = resources.batch_id
          )
        )
      )
      and not public.is_admin_display_name(uploaded_by_name)
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

commit;
