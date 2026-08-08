-- idx_resources_query and idx_notices_query were created before the
-- academic_terms migration added term_id to both tables. Every real
-- query (Notes/Lab, PYQs, Notices, CR Manage) now filters by term_id
-- too, so Postgres was using these indexes for the other columns and
-- then filtering term_id row-by-row instead of through the index.
-- Recreated with term_id folded in — same leading columns, so this is
-- a strict improvement, not a behavior change.

drop index if exists idx_resources_query;
create index idx_resources_query
  on resources (section, status, branch_id, term_id, is_pinned desc, created_at desc);

drop index if exists idx_notices_query;
create index idx_notices_query
  on notices (branch_id, term_id, is_pinned desc, created_at desc);

-- cr_profiles is looked up by auth_user_id per request (already
-- indexed, unique) but every RLS policy also matches on
-- (branch_id, term_id) against that same row — index the pair so the
-- planner doesn't fall back to a sequential scan as cr_profiles grows
-- past a handful of rows.
create index if not exists idx_cr_profiles_branch_term on cr_profiles (branch_id, term_id);
