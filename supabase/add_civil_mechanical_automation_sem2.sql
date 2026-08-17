-- 1st Year — Semester 2 subjects for Civil, Mechanical, and Automation
-- & Robotics — per explicit correction, this mirrors CSE AIML/Core's
-- SEMESTER 1 curriculum (8 subjects, AIML and Core are identical),
-- NOT any CSE Sem 2 curriculum (confirmed empty in an earlier check —
-- this deliberately does not touch or invent one). Mathematics is
-- renamed to "Engineering Mathematics II"; every other subject keeps
-- AIML's exact Sem 1 name.
--
-- Same independence as the Sem 1 migration (add_civil_mechanical_
-- automation_sem1.sql) — new, branch-owned subject rows, not a
-- reference to AIML's rows and not the CSE interchange system.
--
-- Slugs get their own "-s2" segment even where the SUBJECT NAME is
-- identical to one already inserted for Sem 1 (e.g. "Elementary
-- English" exists in both AIDS's Sem 1 list and AIML's Sem 1 list) —
-- the unique constraint (specialization_id, term_id, slug) wouldn't
-- actually collide across different terms, but labSubjects.ts's
-- LAB_SUBJECT_SLUGS/LAB_ONLY_SUBJECT_SLUGS match by slug alone with
-- no term awareness, so keeping every row's slug distinct keeps each
-- one an unambiguous, individually-addressable identifier regardless
-- of whether this particular pair happens to classify the same way.
--
-- No batch_id involved (subjects aren't batch-scoped) — this Sem 2
-- row set is automatically visible only to whichever batch has
-- actually reached 1st Year Sem 2 (2025-26 today; 2026-27 hasn't),
-- same as every other Sem-2 addition so far.

begin;

do $$
declare
  v_civil uuid;
  v_mechanical uuid;
  v_automation uuid;
  v_y1s2 uuid;
begin
  select id into v_civil from branches where slug = 'civil';
  select id into v_mechanical from branches where slug = 'mechanical';
  select id into v_automation from branches where slug = 'automation-robotics';
  select id into v_y1s2 from academic_terms where slug = 'y1-s2';

  -- Civil
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_civil, null, v_y1s2, 'Engineering Mathematics II', 'civil-s2-engineering-mathematics-ii', 1),
    (v_civil, null, v_y1s2, 'Engineering Mechanics', 'civil-s2-engineering-mechanics', 2),
    (v_civil, null, v_y1s2, 'Electrical Engineering', 'civil-s2-electrical-engineering', 3),
    (v_civil, null, v_y1s2, 'Engineering Physics', 'civil-s2-engineering-physics', 4),
    (v_civil, null, v_y1s2, 'Environmental Science', 'civil-s2-environmental-science', 5),
    (v_civil, null, v_y1s2, 'Elementary English', 'civil-s2-elementary-english', 6),
    (v_civil, null, v_y1s2, 'Design and Thinking', 'civil-s2-design-and-thinking', 7),
    (v_civil, null, v_y1s2, 'Engineering Graphics', 'civil-s2-engineering-graphics', 8);

  -- Mechanical
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_mechanical, null, v_y1s2, 'Engineering Mathematics II', 'mechanical-s2-engineering-mathematics-ii', 1),
    (v_mechanical, null, v_y1s2, 'Engineering Mechanics', 'mechanical-s2-engineering-mechanics', 2),
    (v_mechanical, null, v_y1s2, 'Electrical Engineering', 'mechanical-s2-electrical-engineering', 3),
    (v_mechanical, null, v_y1s2, 'Engineering Physics', 'mechanical-s2-engineering-physics', 4),
    (v_mechanical, null, v_y1s2, 'Environmental Science', 'mechanical-s2-environmental-science', 5),
    (v_mechanical, null, v_y1s2, 'Elementary English', 'mechanical-s2-elementary-english', 6),
    (v_mechanical, null, v_y1s2, 'Design and Thinking', 'mechanical-s2-design-and-thinking', 7),
    (v_mechanical, null, v_y1s2, 'Engineering Graphics', 'mechanical-s2-engineering-graphics', 8);

  -- Automation & Robotics
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_automation, null, v_y1s2, 'Engineering Mathematics II', 'automation-robotics-s2-engineering-mathematics-ii', 1),
    (v_automation, null, v_y1s2, 'Engineering Mechanics', 'automation-robotics-s2-engineering-mechanics', 2),
    (v_automation, null, v_y1s2, 'Electrical Engineering', 'automation-robotics-s2-electrical-engineering', 3),
    (v_automation, null, v_y1s2, 'Engineering Physics', 'automation-robotics-s2-engineering-physics', 4),
    (v_automation, null, v_y1s2, 'Environmental Science', 'automation-robotics-s2-environmental-science', 5),
    (v_automation, null, v_y1s2, 'Elementary English', 'automation-robotics-s2-elementary-english', 6),
    (v_automation, null, v_y1s2, 'Design and Thinking', 'automation-robotics-s2-design-and-thinking', 7),
    (v_automation, null, v_y1s2, 'Engineering Graphics', 'automation-robotics-s2-engineering-graphics', 8);
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from subjects
  where branch_id in (
    select id from branches where slug in ('civil', 'mechanical', 'automation-robotics')
  )
  and slug like '%-s2-%';
  if v_count != 24 then
    raise exception 'expected exactly 24 new Sem 2 subject rows (8 x 3 branches), got %', v_count;
  end if;
end $$;

commit;
