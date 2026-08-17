-- Renames Civil/Mechanical/Automation & Robotics' "Elementary English"
-- subject to "Elementary English I" for Sem 1 and "Elementary English
-- II" for Sem 2, matching the same rename already applied to CSE
-- Core/AIML/AIDS (see rename_elementary_english.sql). Purely a
-- display-name change on the existing explicit subject rows — doesn't
-- touch slugs, ids, or any resource row, so every existing resource
-- attached to these subjects keeps working unchanged.

begin;

update subjects set name = 'Elementary English I'
where id in (
  '82edcba8-29e6-4692-a55a-8a3f4d4b7d73', -- Automation & Robotics, Sem 1
  'b9246c85-852c-401c-8be0-f96edf7a7238', -- Civil, Sem 1
  '34c8a426-08ed-4756-bbad-d882e5d2e9a4'  -- Mechanical, Sem 1
);

update subjects set name = 'Elementary English II'
where id in (
  'f5e5ea03-357e-495e-b477-82b860843d58', -- Automation & Robotics, Sem 2
  'e809026b-8f29-4b4d-bee4-878c273c31e0', -- Civil, Sem 2
  '7e8f1f66-6b9b-4f55-b56f-3604924741d8'  -- Mechanical, Sem 2
);

commit;
