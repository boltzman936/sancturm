-- Tightens "CR or admin manages" on notices from branch-only to the
-- CR's full own scope (branch + specialization + batch) — previously
-- ANY CR in a branch could delete/edit ANY notice in that branch,
-- including ones posted by a sibling specialization's own CR (e.g.
-- CSE Core's CR could delete CSE AIML's notice). "CRs can only
-- manage/delete their own Notices" per explicit product decision.
-- Admin keeps unrestricted access, unchanged.
--
-- IS NOT DISTINCT FROM (not plain =) for specialization_id — a plain
-- tuple/column equality check against NULL never matches (SQL's NULL
-- <> NULL semantics), which would silently lock every non-CSE branch's
-- CR out of their own notices entirely.
drop policy if exists "CR or admin manages" on notices;
create policy "CR or admin manages" on notices for all
  using (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = notices.branch_id
        and cp.batch_id = notices.batch_id
        and cp.specialization_id is not distinct from notices.specialization_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  )
  with check (
    exists (
      select 1 from cr_profiles cp
      where cp.auth_user_id = auth.uid()
        and cp.branch_id = notices.branch_id
        and cp.batch_id = notices.batch_id
        and cp.specialization_id is not distinct from notices.specialization_id
    )
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );
