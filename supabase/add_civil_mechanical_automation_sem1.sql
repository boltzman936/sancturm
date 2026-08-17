-- 1st Year — Semester 1 subjects for Civil, Mechanical, and Automation
-- & Robotics — mirrors CSE AIDS's exact Sem 1 curriculum (8 subjects),
-- with Mathematics renamed to "Engineering Mathematics I" per
-- explicit instruction (not "Elementary Mathematics", not AIDS's own
-- "Mathematics I"). Every other subject keeps AIDS's exact name.
--
-- These are NEW, INDEPENDENT subject rows per branch — not a shared
-- reference to AIDS's rows, and not the CSE interchange system (that
-- mechanism only ever operates within CSE's own specializations, and
-- nothing here touches it). A resource uploaded against, say, Civil's
-- own "C Programming" subject is tied to Civil's own subject id;
-- there is no cross-branch link at all, so resources stay correctly
-- branch-aware exactly as instructed.
--
-- Notes/Lab classification mirrors AIDS's exact per-subject shape
-- (see labSubjects.ts's own comment on AIDS's Sem 1 list): C
-- Programming, Digital Electronics, and Manufacturing have both notes
-- and lab; Soft Skill is lab-only; everything else is notes-only.
--
-- Zero pre-existing subjects for any of these 3 branches (confirmed
-- live before writing this) — nothing here can collide with real
-- data. Sem 3 is deliberately NOT touched — the user will provide
-- that curriculum separately.

begin;

do $$
declare
  v_civil uuid;
  v_mechanical uuid;
  v_automation uuid;
  v_y1s1 uuid;
begin
  select id into v_civil from branches where slug = 'civil';
  select id into v_mechanical from branches where slug = 'mechanical';
  select id into v_automation from branches where slug = 'automation-robotics';
  select id into v_y1s1 from academic_terms where slug = 'y1-s1';

  -- Civil
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_civil, null, v_y1s1, 'Engineering Mathematics I', 'civil-engineering-mathematics-i', 1),
    (v_civil, null, v_y1s1, 'C Programming', 'civil-c-programming', 2),
    (v_civil, null, v_y1s1, 'Digital Electronics', 'civil-digital-electronics', 3),
    (v_civil, null, v_y1s1, 'Professional Communication', 'civil-professional-communication', 4),
    (v_civil, null, v_y1s1, 'Manufacturing', 'civil-manufacturing', 5),
    (v_civil, null, v_y1s1, 'Elementary English', 'civil-elementary-english', 6),
    (v_civil, null, v_y1s1, 'Soft Skill', 'civil-soft-skill', 7),
    (v_civil, null, v_y1s1, 'Engineering Chemistry', 'civil-engineering-chemistry', 8);

  -- Mechanical
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_mechanical, null, v_y1s1, 'Engineering Mathematics I', 'mechanical-engineering-mathematics-i', 1),
    (v_mechanical, null, v_y1s1, 'C Programming', 'mechanical-c-programming', 2),
    (v_mechanical, null, v_y1s1, 'Digital Electronics', 'mechanical-digital-electronics', 3),
    (v_mechanical, null, v_y1s1, 'Professional Communication', 'mechanical-professional-communication', 4),
    (v_mechanical, null, v_y1s1, 'Manufacturing', 'mechanical-manufacturing', 5),
    (v_mechanical, null, v_y1s1, 'Elementary English', 'mechanical-elementary-english', 6),
    (v_mechanical, null, v_y1s1, 'Soft Skill', 'mechanical-soft-skill', 7),
    (v_mechanical, null, v_y1s1, 'Engineering Chemistry', 'mechanical-engineering-chemistry', 8);

  -- Automation & Robotics
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_automation, null, v_y1s1, 'Engineering Mathematics I', 'automation-robotics-engineering-mathematics-i', 1),
    (v_automation, null, v_y1s1, 'C Programming', 'automation-robotics-c-programming', 2),
    (v_automation, null, v_y1s1, 'Digital Electronics', 'automation-robotics-digital-electronics', 3),
    (v_automation, null, v_y1s1, 'Professional Communication', 'automation-robotics-professional-communication', 4),
    (v_automation, null, v_y1s1, 'Manufacturing', 'automation-robotics-manufacturing', 5),
    (v_automation, null, v_y1s1, 'Elementary English', 'automation-robotics-elementary-english', 6),
    (v_automation, null, v_y1s1, 'Soft Skill', 'automation-robotics-soft-skill', 7),
    (v_automation, null, v_y1s1, 'Engineering Chemistry', 'automation-robotics-engineering-chemistry', 8);
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from subjects
  where branch_id in (
    select id from branches where slug in ('civil', 'mechanical', 'automation-robotics')
  );
  if v_count != 24 then
    raise exception 'expected exactly 24 new subject rows (8 x 3 branches), got %', v_count;
  end if;
end $$;

commit;
