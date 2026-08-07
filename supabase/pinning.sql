-- `resources` already has `is_pinned` (see supabase/migrations/0001_init.sql)
-- but nothing ever set or read it. Notices and Sancturm updates get the
-- same flag now, so all four sections share one pinning model — no
-- RLS changes needed anywhere: pinning is just another column update,
-- already covered by each table's existing "CR or admin
-- updates/manages" policy.
alter table notices add column is_pinned boolean not null default false;
alter table sanctum_updates add column is_pinned boolean not null default false;
