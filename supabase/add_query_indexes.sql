-- No index existed on any of the columns every real query in the app
-- actually filters or sorts by — only primary keys. Harmless at 0-1
-- rows per table, but every one of these becomes a full sequential
-- scan as soon as uploads pile up over a semester. Each index below
-- is shaped to match a specific query in the codebase, not just
-- "index everything":
--
-- resources: useNotesAndLabResources filters (section, status,
-- branch_id) and orders by (is_pinned desc, created_at desc);
-- usePyqResources filters (section, status) with the same order.
-- Leading columns section+status cover both; the trailing two give
-- Postgres the sort order for free instead of a separate sort step.
create index if not exists idx_resources_query
  on resources (section, status, branch_id, is_pinned desc, created_at desc);

-- notices: useNotices filters by branch_id, same pinned/date order.
create index if not exists idx_notices_query
  on notices (branch_id, is_pinned desc, created_at desc);

-- sancturm_updates: global (no branch filter), same pinned/date order.
create index if not exists idx_sancturm_updates_order
  on sancturm_updates (is_pinned desc, created_at desc);
