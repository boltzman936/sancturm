-- One-time initialization: for Biotechnology's 2025-26 curriculum,
-- copy every existing, genuine pre-restructure resource (updated_at <
-- 2026-08-17, the same real-insertion-time cutoff used throughout
-- today's restructure — see initialize_2025_26_shared_content.sql)
-- from the CSE subject that is academically the same subject into a
-- NEW, independent resource row under Biotechnology's own subject.
-- Same file_url (no physical file duplication in storage); a fresh
-- row, fresh id, Biotechnology's own branch/specialization/term/
-- subject, reset engagement counters. After this migration,
-- Biotechnology's resources are completely independent — editing,
-- deleting, or re-uploading in one context never touches another, and
-- no live/dynamic resolver exists anywhere (matches the Civil/
-- Mechanical/Automation & Robotics approach exactly).
--
-- Pairing notes:
--  - Biotechnology's own Sem 1 mirrors CSE Core/AIML's Sem 1 curriculum
--    (Engineering Physics, Engineering Mechanics, Environmental
--    Science, Design and Thinking, Elementary English I) — pooled from
--    both specializations, same as every other branch's Sem-1/Sem-2
--    mirroring pattern established today.
--  - Biotechnology's own Sem 2 mirrors CSE AIDS's Sem 1 curriculum
--    (Engineering Chemistry, C Programming, Manufacturing, Professional
--    Communication, Elementary English II <- AIDS's "Elementary
--    English I").
--  - Biotechnology splits some CSE subjects into a separate notes-only
--    and lab-only subject row (Engineering Physics/Physics,
--    Engineering Mechanics/Mechanics) where CSE keeps both resource
--    types on one row. Checked live: CSE's Engineering Physics and
--    Engineering Mechanics currently have zero lab_manual resources
--    (notes/pyq/pyq_solution only), so Biotechnology's "Physics" and
--    "Mechanics" (lab-only) subjects have nothing to initialize from
--    and are deliberately left out of this migration — they stay
--    empty, per "if no existing content exists, leave it empty."
--  - Biotechnology's "Graphics" (lab-only) pairs with CSE's own
--    "Engineering Graphics" (also lab-only in CSE), which does have
--    content — included below.
--  - Biotechnology's "Chemistry" (lab-only) has no CSE source: CSE
--    AIDS's "Engineering Chemistry" has zero resources at all. Left
--    out — stays empty.
--  - Biotechnology's "Soft Skill" (lab-only) pairs with CSE AIDS's
--    "Soft Skill", which also currently has zero resources. Left out
--    — stays empty.
--  - Subjects genuinely specific to Biotechnology with no CSE
--    equivalent (Elementary Mathematics I/II, Biotechnology I/II,
--    Biotechnology, and every 2nd-year subject: Analytical Techniques,
--    Biochemistry, Biostatistics, Cell & Molecular Biology, Enzyme
--    Engineering, Microbiology, Linux & PERL Programming, Basics of
--    Food and Nutrition) are not part of this migration at all — no
--    fake/placeholder content is created for them.

begin;

with subject_pairs (target_subject_id, source_subject_id) as (
  values
  ('03f89528-5d98-4fe1-93d0-38f81ee0021b'::uuid, 'cc8fa343-c36f-4d0a-85da-b60eb45e0a1f'::uuid), -- Biotech Engineering Physics <- CSE Core Engineering Physics
  ('03f89528-5d98-4fe1-93d0-38f81ee0021b'::uuid, 'edd9243f-cc86-458d-9c83-ee226281b1f4'::uuid), -- Biotech Engineering Physics <- CSE AIML Engineering Physics
  ('29bc2880-9d3c-47b8-a60e-5fe0171c6b55'::uuid, 'a8cf8505-60fc-46f3-b191-c1532492415f'::uuid), -- Biotech Engineering Mechanics <- CSE Core Engineering Mechanics
  ('29bc2880-9d3c-47b8-a60e-5fe0171c6b55'::uuid, '6d441c1a-8322-40df-a120-7efbd1895925'::uuid), -- Biotech Engineering Mechanics <- CSE AIML Engineering Mechanics
  ('78f9b277-480c-47bf-bc2a-3a7316811b86'::uuid, 'fec8d670-cf99-4080-a584-4c6133ce2013'::uuid), -- Biotech Environmental Science <- CSE Core Environmental Science
  ('78f9b277-480c-47bf-bc2a-3a7316811b86'::uuid, '73e5f8ba-a68f-487c-89a2-4b97e623661a'::uuid), -- Biotech Environmental Science <- CSE AIML Environmental Science
  ('8fce2b21-3bcc-4a99-9a0a-d7e41951448f'::uuid, '20c2de26-6ac8-4ab5-89e5-e999b797f754'::uuid), -- Biotech Design & Thinking <- CSE Core Design and Thinking
  ('8fce2b21-3bcc-4a99-9a0a-d7e41951448f'::uuid, '98acbf8a-659d-4873-8c30-45b1f680f85a'::uuid), -- Biotech Design & Thinking <- CSE AIML Design and Thinking
  ('b52b96c3-ff11-4a42-b40e-8a110c43f639'::uuid, '0fcc9438-8877-4212-b421-906209c8d195'::uuid), -- Biotech Elementary English I <- CSE Core Elementary English I
  ('b52b96c3-ff11-4a42-b40e-8a110c43f639'::uuid, 'c51320de-9085-4ecd-b09f-aae9346a6121'::uuid), -- Biotech Elementary English I <- CSE AIML Elementary English I
  ('f01a0eed-7abb-4dec-9457-83714fc73659'::uuid, 'f609cb45-1168-4e19-b7ba-72985a5d8ecb'::uuid), -- Biotech Graphics <- CSE Core Engineering Graphics
  ('f01a0eed-7abb-4dec-9457-83714fc73659'::uuid, '7cf989e8-9095-4cba-aa7b-948388360872'::uuid), -- Biotech Graphics <- CSE AIML Engineering Graphics
  ('59bb12ba-5295-4397-a3c8-7ccde30b627e'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- Biotech Engineering Chemistry <- CSE AIDS Engineering Chemistry
  ('b9b8035b-2f8b-4117-b800-23f3f19464b9'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- Biotech C Programming <- CSE AIDS C Programming
  ('4ff60570-03d6-41d8-a6b1-09e732f97b62'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- Biotech Manufacturing <- CSE AIDS Manufacturing
  ('ef532362-b45f-47ba-a037-7909f6dacb42'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- Biotech Professional Communication <- CSE AIDS Professional Communication
  ('bb7a3b3a-8c1a-4dca-ae61-9088ab09daf6'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid) -- Biotech Elementary English II <- CSE AIDS Elementary English I
)
insert into resources (
  branch_id, specialization_id, term_id, batch_id, subject_id,
  section, resource_type, title, description, file_url, status,
  uploaded_by_device, uploaded_by_name, created_at
)
select
  target_subj.branch_id, target_subj.specialization_id, target_subj.term_id, r.batch_id, target_subj.id,
  r.section, r.resource_type, r.title, r.description, r.file_url, r.status,
  r.uploaded_by_device, r.uploaded_by_name, r.created_at
from resources r
join subject_pairs sp on sp.source_subject_id = r.subject_id
join subjects target_subj on target_subj.id = sp.target_subject_id
where r.updated_at < '2026-08-17T00:00:00Z';

commit;
