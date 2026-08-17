-- Renames CSE Core/AIML/AIDS's "Elementary English" subject to
-- "Elementary English I" for Sem 1 and "Elementary English II" for
-- Sem 2, across all three specializations. Purely a display-name
-- change on the existing explicit subject rows (see
-- create_cse_sem2_subjects.sql for how the Sem 2 rows were created) —
-- doesn't touch slugs, ids, or any resource row, so every existing
-- resource attached to these subjects keeps working unchanged.

begin;

update subjects set name = 'Elementary English I'
where id in (
  '0fcc9438-8877-4212-b421-906209c8d195', -- CSE Core, Sem 1
  'c51320de-9085-4ecd-b09f-aae9346a6121', -- CSE AIML, Sem 1
  'a671780f-b409-496d-9cc5-991ad226d7e8'  -- CSE AIDS, Sem 1
);

update subjects set name = 'Elementary English II'
where id in (
  'f6d67814-ae63-41e5-b956-f49e90fdce62', -- CSE Core, Sem 2
  '6efdb858-0a10-415f-9451-14623dd60b36', -- CSE AIML, Sem 2
  'c353516a-144b-44f6-a927-69589188681e'  -- CSE AIDS, Sem 2
);

commit;
