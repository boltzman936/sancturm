-- Centralized PYQ resources: one canonical Subject ID -> one resource
-- row, visible everywhere that subject applies (any batch/year/branch/
-- specialization sharing it), instead of one fanned-out row per
-- academic context. See historicalSharing.ts / add_canonical_subjects.sql
-- for the canonical_subjects infrastructure this builds on.
--
-- branch_id/specialization_id/term_id/batch_id on resources stay
-- required and populated (the uploader's own context at upload time)
-- for every row, including centralized ones -- for a row with
-- canonical_subject_id set they are provenance only, never used to
-- scope visibility. subject_id is set to null on centralized rows
-- (no single context's subject row owns them).
alter table resources add column if not exists canonical_subject_id uuid references canonical_subjects(id);
create index if not exists resources_canonical_subject_id_idx on resources(canonical_subject_id);
