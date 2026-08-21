-- Reverses add_cse_chemistry_lab_subject.sql — detaches the 4
-- resources back to subject_id NULL, then drops the 3 new subject
-- rows (the resource rows themselves are untouched either way, only
-- their subject_id).

begin;

update resources
set subject_id = null
where subject_id in (
  select id from subjects
  where branch_id = '11882125-634c-45df-b51f-dd8c775c660e'
    and slug = 'chemistry'
);

delete from subjects
where branch_id = '11882125-634c-45df-b51f-dd8c775c660e'
  and slug = 'chemistry';

commit;
