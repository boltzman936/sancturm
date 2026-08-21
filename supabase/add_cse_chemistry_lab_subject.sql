-- Adds "Chemistry" as a lab-only subject (no notes/theory counterpart
-- — matches AIDS's own "Engineering Chemistry" pattern where the lab
-- component is a genuinely separate subject, same as Biotechnology's
-- "Chemistry") to exactly the 3 CSE contexts asked for:
--   CSE AIDS  -> 1st Year Sem 1
--   CSE Core  -> 1st Year Sem 2
--   CSE AIML  -> 1st Year Sem 2
--
-- Not scoped per-batch — subjects has no batch_id column at all (see
-- its own schema), so these 3 rows automatically cover every batch at
-- that (specialization, term) pair, including 2026-27's own AIDS
-- Sem 1, with nothing extra to add there.
--
-- 4 existing resources (2 "Chem lab till exp 6", 1 "Chemistry PYQ's
-- Solution" under AIDS Sem 1, 1 more "Chem lab till exp 6" each under
-- AIML/Core Sem 2) were already uploaded into exactly these 3 contexts
-- with subject_id NULL ("Extra") — this migration re-attaches them to
-- the new subject instead of creating duplicate resource rows, per
-- "show existing Chemistry resources where already present; don't
-- create unnecessary duplicates."

begin;

with new_subjects as (
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order)
  values
    -- CSE AIDS, 1st Year Sem 1 (existing subjects there run sort_order 1-8)
    ('11882125-634c-45df-b51f-dd8c775c660e', 'f581246d-6feb-4095-aa33-e82e88a1de3f', '06223e4a-932a-44ca-b4f5-8d4bd50a5eba', 'Chemistry', 'chemistry', 9),
    -- CSE Core, 1st Year Sem 2 (existing subjects there run sort_order 1-8)
    ('11882125-634c-45df-b51f-dd8c775c660e', '67e55583-69ed-4a50-9aad-256fdff9fec1', 'f9699ad2-6f0c-469e-9b28-e59ef838d889', 'Chemistry', 'chemistry', 9),
    -- CSE AIML, 1st Year Sem 2 (existing subjects there run sort_order 1-8)
    ('11882125-634c-45df-b51f-dd8c775c660e', '09b06a94-bcf3-41c2-9858-0ec5cb6b647a', 'f9699ad2-6f0c-469e-9b28-e59ef838d889', 'Chemistry', 'chemistry', 9)
  returning id, specialization_id, term_id
)
update resources r
set subject_id = ns.id
from new_subjects ns
where r.specialization_id = ns.specialization_id
  and r.term_id = ns.term_id
  and r.subject_id is null
  and r.title in ('Chem lab till exp 6', 'Chemistry PYQ''s Solution')
  and r.branch_id = '11882125-634c-45df-b51f-dd8c775c660e';

commit;
