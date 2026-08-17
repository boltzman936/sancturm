-- Fixes a real pre-existing gap, confirmed live and flagged (not
-- caused) by expand_branch_hierarchy.sql: add_batches.sql originally
-- inserted a (2025-26, y1-s2) batch_terms row
-- ('2025-26', 'y1-s2', 2026-01-01, 2026-07-31), but the live database
-- doesn't have it — 2025-26's batch_terms jumps straight from y1-s1
-- (Aug-Dec 2025) to y2-s3 (Aug-Dec 2026), skipping 1st-Year Sem 2
-- entirely. Since academic_terms/batch_terms are global (no branch_id
-- column at all — confirmed in the branch-expansion migration), this
-- one row benefits every branch identically, CSE included, not just
-- the new ones.
--
-- Same date range the original migration used — fills the exact gap
-- between y1-s1's end (2025-12-30) and y2-s3's start (2026-08-01).

insert into batch_terms (batch_id, term_id, start_date, end_date)
select b.id, t.id, date '2026-01-01', date '2026-07-31'
from batches b, academic_terms t
where b.label = '2025-26' and t.slug = 'y1-s2'
on conflict (batch_id, term_id) do nothing;
