-- PYQ gets the same two-kind split Notes & Lab already has (one
-- section, two resource_type values) — 'pyq' for the actual question
-- paper, 'pyq_solution' for a worked solution to it. Existing PYQ rows
-- were inserted with resource_type='pdf', a generic placeholder from
-- before this split existed — migrated to 'pyq' below so they show up
-- under the right tab instead of neither.
--
-- 'pdf' is kept in the allowed list (not dropped) purely so nothing
-- currently relying on it breaks — nothing new should insert it going
-- forward.

alter table resources drop constraint resources_resource_type_check;
alter table resources add constraint resources_resource_type_check
  check (resource_type = any (array[
    'notes', 'lab_manual', 'code', 'assignment', 'viva', 'record_file',
    'pdf', 'pyq', 'pyq_solution'
  ]));

update resources set resource_type = 'pyq' where section = 'pyq' and resource_type = 'pdf';
