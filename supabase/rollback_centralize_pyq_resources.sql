drop index if exists resources_canonical_subject_id_idx;
alter table resources drop column if exists canonical_subject_id;
