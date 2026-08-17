-- Renames CSE Core/AIML/AIDS's own 1st Year Sem 2 "Mathematics I"
-- subject to "Mathematics II" — it's the second-semester math course
-- following Sem 1's "Mathematics I", so the Sem 2 name was wrong ever
-- since these rows were cloned from their Sem 1 source (see
-- create_cse_sem2_subjects.sql). Purely a display-name change on the
-- existing explicit subject row — doesn't touch slugs, ids, or any
-- resource row, so every existing resource attached to these subjects
-- keeps working unchanged.

begin;

update subjects set name = 'Mathematics II'
where id in (
  '0946aebb-dc6b-404c-ad12-6122170c5612', -- CSE AIDS, Sem 2
  'cb677898-d347-4c1b-baaa-0858735ad852', -- CSE AIML, Sem 2
  'a62c5ac4-0947-40c9-a93b-f2292219693a'  -- CSE Core, Sem 2
);

commit;
