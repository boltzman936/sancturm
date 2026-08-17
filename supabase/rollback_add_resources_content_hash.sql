begin;

drop index if exists idx_resources_content_hash;
alter table resources drop column if exists content_hash;

commit;
