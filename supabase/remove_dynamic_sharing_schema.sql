-- Cleanup after the resource-sharing architecture restructure: both
-- of these existed purely to support the removed dynamic/live
-- resolvers (legacy_shared gated the removed cross-context query;
-- subject_structure_config drove the removed Sem 2 interchange
-- toggle). Every academic context now has its own explicit, permanent
-- subject and resource rows (see create_cse_sem2_subjects.sql and
-- initialize_2025_26_shared_content.sql), so neither is read by any
-- code path anymore.

begin;

alter table resources drop column if exists legacy_shared;
drop table if exists subject_structure_config;

commit;
