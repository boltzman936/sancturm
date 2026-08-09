-- Pre-production security audit fixes. Every change here closes a gap
-- found by querying pg_policies directly against the live database —
-- not just reading migration files, since this repo's own history
-- shows a policy can be silently reverted by a later migration
-- without anyone noticing (see scope_cr_by_term.sql's PYQ note).

-- 1. cr_profiles and admins were readable by ANYONE, including a fully
--    unauthenticated request straight to Supabase's REST API with just
--    the public anon key — no login needed. That's every CR's and
--    admin's real name, which auth account maps to which branch/term,
--    fully enumerable by anyone on the internet. Checked every place
--    the app itself reads these tables (src/lib/auth/role.ts and
--    useCurrentRole.ts) — both always filter to the CALLER's own
--    auth_user_id, never anyone else's, so tightening this to
--    "your own row, or an admin can see everyone" changes nothing
--    the app actually relies on.
drop policy if exists "Public read" on cr_profiles;
create policy "Read own profile, or any if admin" on cr_profiles for select
  using (
    auth_user_id = auth.uid()
    or exists (select 1 from admins where auth_user_id = auth.uid())
  );

-- admins' OWN policy must NOT reference admins again inside itself —
-- first version of this fix did exactly that ("or exists (select 1
-- from admins where ...)") and it went live as "infinite recursion
-- detected in policy for relation admins", a real 500 on every
-- resources/notices/subjects query for the ~10 minutes it took to
-- catch (a query on ANY table whose policy checks "is this user an
-- admin" ends up evaluating admins' own policy, which — if that
-- policy queries admins again — recurses forever). Caught by actually
-- testing the fix as the anon role afterward, not by assuming it
-- worked; left in as the cautionary example for why that test step
-- isn't optional. auth_user_id = auth.uid() alone is sufficient here:
-- no app code (checked above) ever needs an admin to list OTHER
-- admins, only ever "is the CURRENT user an admin".
drop policy if exists "Public read" on admins;
drop policy if exists "Read own row, or any if admin" on admins;
create policy "Read own row" on admins for select
  using (auth_user_id = auth.uid());

-- 2. resource_ratings: dead table (grep confirms zero references in
--    src/ — no UI ever reads or writes it), but its RLS policies were
--    live and callable directly via the Supabase REST API regardless
--    of what the Next.js app does. "Public insert" had no restriction
--    at all, and "Public update own rating" didn't actually check
--    ownership despite its name (USING (true) — any anonymous request
--    could modify ANY row, not just "its own"). Revoking both rather
--    than dropping the table, in case a future rating feature reuses
--    it with real ownership checks.
drop policy if exists "Public insert" on resource_ratings;
drop policy if exists "Public update own rating" on resource_ratings;

-- 3. class_updates: another dead table (superseded by sancturm_updates
--    long ago — zero references in src/ outside old seed/migration
--    SQL) whose CR-write policy predates the academic-term migration:
--    it only checked branch_id, not term_id, so a 1st-Year CR could
--    have written "class updates" scoped to their branch's 2nd-Year
--    term too. Never exploited (cr_profiles was empty when this was
--    written and the UI never surfaces this table), but revoking the
--    stale write policy now rather than leaving unnecessary write
--    access sitting on a table nothing legitimate uses. Public read
--    stays — it's just old announcement text, not sensitive.
drop policy if exists "CR manages own branch" on class_updates;
drop policy if exists "CR or admin manages" on class_updates;

-- 4. resource_reports: same dead-table-with-public-write pattern —
--    zero references in src/, but "Anyone can report" let a fully
--    unauthenticated request insert unlimited rows (only a valid
--    resource_id foreign key required, no rate limit). Doesn't leak
--    anything, but unbounded anonymous writes to an otherwise-unused
--    table is exactly the kind of forgotten write surface that's easy
--    to spam. Revoked for the same reason as resource_ratings above.
drop policy if exists "Anyone can report" on resource_reports;
