-- 2nd Year — Semester 3 subjects for Civil, Mechanical, and Automation
-- & Robotics — a real, distinct curriculum per branch, given directly
-- (not mirrored from AIDS/AIML like Sem 1/Sem 2 were). Every given Lab
-- subject has its own distinct name (always ending "Lab") with no
-- exact-string match against the given Notes list for that branch —
-- e.g. Civil's "Fluid Mechanics" (notes) vs "Fluid Mechanics Lab"
-- (lab) are two different subjects, not one shared row — so every lab
-- entry across all three branches is lab-only here, unlike Sem 1/2
-- where some subjects were genuinely shared between both tabs.
--
-- Same independence as the Sem 1/2 migrations — new, branch-owned
-- subject rows, no cross-branch link, no CSE interchange involvement.
-- Not touching CSE/AIDS/AIML/Biotechnology/Cyber Security, or the
-- existing chronology — 2025-26 already resolves to Sem 3 as current
-- for these branches with zero changes needed here.

begin;

do $$
declare
  v_civil uuid;
  v_mechanical uuid;
  v_automation uuid;
  v_y2s3 uuid;
begin
  select id into v_civil from branches where slug = 'civil';
  select id into v_mechanical from branches where slug = 'mechanical';
  select id into v_automation from branches where slug = 'automation-robotics';
  select id into v_y2s3 from academic_terms where slug = 'y2-s3';

  -- Civil (10: 6 notes-only + 4 lab-only)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_civil, null, v_y2s3, 'Engineering Mathematics-III', 'civil-s3-engineering-mathematics-iii', 1),
    (v_civil, null, v_y2s3, 'Strength of Materials', 'civil-s3-strength-of-materials', 2),
    (v_civil, null, v_y2s3, 'Basic Surveying', 'civil-s3-basic-surveying', 3),
    (v_civil, null, v_y2s3, 'Fluid Mechanics', 'civil-s3-fluid-mechanics', 4),
    (v_civil, null, v_y2s3, 'Building Material and Construction', 'civil-s3-building-material-and-construction', 5),
    (v_civil, null, v_y2s3, 'Disaster Management', 'civil-s3-disaster-management', 6),
    (v_civil, null, v_y2s3, 'Fluid Mechanics Lab', 'civil-s3-fluid-mechanics-lab', 7),
    (v_civil, null, v_y2s3, 'Basic Surveying Lab', 'civil-s3-basic-surveying-lab', 8),
    (v_civil, null, v_y2s3, 'Building, Material & Construction Lab', 'civil-s3-building-material-construction-lab', 9),
    (v_civil, null, v_y2s3, 'Civil Engineering Drawing Lab', 'civil-s3-civil-engineering-drawing-lab', 10);

  -- Mechanical (9: 5 notes-only + 4 lab-only)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_mechanical, null, v_y2s3, 'Mathematics-III', 'mechanical-s3-mathematics-iii', 1),
    (v_mechanical, null, v_y2s3, 'Engineering Thermodynamics', 'mechanical-s3-engineering-thermodynamics', 2),
    (v_mechanical, null, v_y2s3, 'Mechanics of Deformable Solids', 'mechanical-s3-mechanics-of-deformable-solids', 3),
    (v_mechanical, null, v_y2s3, 'Engineering Materials and Applications', 'mechanical-s3-engineering-materials-and-applications', 4),
    (v_mechanical, null, v_y2s3, 'Fluid Mechanics', 'mechanical-s3-fluid-mechanics', 5),
    (v_mechanical, null, v_y2s3, 'Engineering Material Lab', 'mechanical-s3-engineering-material-lab', 6),
    (v_mechanical, null, v_y2s3, 'Fluid Mechanics Lab', 'mechanical-s3-fluid-mechanics-lab', 7),
    (v_mechanical, null, v_y2s3, 'Computer Aided Machine Drawing Lab', 'mechanical-s3-computer-aided-machine-drawing-lab', 8),
    (v_mechanical, null, v_y2s3, 'Thermodynamics Lab', 'mechanical-s3-thermodynamics-lab', 9);

  -- Automation & Robotics (9: 5 notes-only + 4 lab-only)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_automation, null, v_y2s3, 'Mathematics-III', 'automation-robotics-s3-mathematics-iii', 1),
    (v_automation, null, v_y2s3, 'Python Programming', 'automation-robotics-s3-python-programming', 2),
    (v_automation, null, v_y2s3, 'Digital Electronics', 'automation-robotics-s3-digital-electronics', 3),
    (v_automation, null, v_y2s3, 'Mechanics of Deformable Solids', 'automation-robotics-s3-mechanics-of-deformable-solids', 4),
    (v_automation, null, v_y2s3, 'Engineering Materials and Applications', 'automation-robotics-s3-engineering-materials-and-applications', 5),
    (v_automation, null, v_y2s3, 'Python Lab', 'automation-robotics-s3-python-lab', 6),
    (v_automation, null, v_y2s3, 'Digital Electronics Lab', 'automation-robotics-s3-digital-electronics-lab', 7),
    (v_automation, null, v_y2s3, 'Engineering Materials Lab', 'automation-robotics-s3-engineering-materials-lab', 8),
    (v_automation, null, v_y2s3, 'Computer Aided Machine Drawing Lab', 'automation-robotics-s3-computer-aided-machine-drawing-lab', 9);
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from subjects
  where branch_id in (
    select id from branches where slug in ('civil', 'mechanical', 'automation-robotics')
  )
  and slug like '%-s3-%';
  if v_count != 28 then
    raise exception 'expected exactly 28 new Sem 3 subject rows (10 + 9 + 9), got %', v_count;
  end if;
end $$;

commit;
