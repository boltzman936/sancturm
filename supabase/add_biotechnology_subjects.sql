-- Biotechnology Engineering's subject shells — Notes/Lab subject rows
-- only, no resources, no PYQs, no PYQ Solutions. Structure only, per
-- instruction: "Do not automatically create PYQs/PYQ
-- Solutions/Notes/Labs" — every one of those becomes available to
-- upload against these subjects automatically, since resource_type
-- lives on the resource being uploaded, not the subject itself.
--
-- specialization_id is null throughout — Biotechnology has no
-- specialization concept (has_specializations = false). No batch_id
-- column exists on subjects at all: which BATCHES can actually see a
-- given semester's subjects is governed entirely by batch_terms'
-- existing dates (2026-27 hasn't reached 1st Year Sem 2 yet, so these
-- Sem-2 rows are invisible there today without any extra exclusion
-- rule — they become visible automatically the moment that batch
-- reaches it, same as every other branch).
--
-- Zero pre-existing Biotechnology subjects (confirmed live before
-- writing this) — nothing here can collide with or orphan real data.

begin;

do $$
declare
  v_branch_id uuid;
  v_y1s1 uuid;
  v_y1s2 uuid;
  v_y2s3 uuid;
begin
  select id into v_branch_id from branches where slug = 'biotechnology';
  select id into v_y1s1 from academic_terms where slug = 'y1-s1';
  select id into v_y1s2 from academic_terms where slug = 'y1-s2';
  select id into v_y2s3 from academic_terms where slug = 'y2-s3';

  if v_branch_id is null then raise exception 'biotechnology branch not found'; end if;

  -- ============================================================
  -- 1st Year — Semester 1 (10 rows: 6 notes-only, 4 lab-only —
  -- zero name overlap between the two lists as given).
  -- ============================================================
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_branch_id, null, v_y1s1, 'Elementary Mathematics I', 'biotech-elementary-mathematics-i', 1),
    (v_branch_id, null, v_y1s1, 'Engineering Physics', 'biotech-engineering-physics', 2),
    (v_branch_id, null, v_y1s1, 'Engineering Mechanics', 'biotech-engineering-mechanics', 3),
    (v_branch_id, null, v_y1s1, 'Environmental Science', 'biotech-environmental-science', 4),
    (v_branch_id, null, v_y1s1, 'Design & Thinking', 'biotech-design-and-thinking', 5),
    (v_branch_id, null, v_y1s1, 'Biotechnology I', 'biotech-biotechnology-i', 6),
    (v_branch_id, null, v_y1s1, 'Physics', 'biotech-physics', 7),
    (v_branch_id, null, v_y1s1, 'Biotechnology', 'biotech-biotechnology', 8),
    (v_branch_id, null, v_y1s1, 'Mechanics', 'biotech-mechanics', 9),
    (v_branch_id, null, v_y1s1, 'Graphics', 'biotech-graphics', 10);

  -- ============================================================
  -- 1st Year — Semester 2 (8 unique rows: C Programming,
  -- Biotechnology II, and Manufacturing appear in both the given
  -- Notes and Lab lists — one shared row each, not two).
  -- ============================================================
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_branch_id, null, v_y1s2, 'Elementary Mathematics II', 'biotech-elementary-mathematics-ii', 1),
    (v_branch_id, null, v_y1s2, 'Engineering Chemistry', 'biotech-engineering-chemistry', 2),
    (v_branch_id, null, v_y1s2, 'Biotechnology II', 'biotech-biotechnology-ii', 3),
    (v_branch_id, null, v_y1s2, 'C Programming', 'biotech-c-programming', 4),
    (v_branch_id, null, v_y1s2, 'Manufacturing', 'biotech-manufacturing', 5),
    (v_branch_id, null, v_y1s2, 'Professional Communication', 'biotech-professional-communication', 6),
    (v_branch_id, null, v_y1s2, 'Chemistry', 'biotech-chemistry', 7),
    (v_branch_id, null, v_y1s2, 'Soft Skill', 'biotech-soft-skill', 8);

  -- ============================================================
  -- 2nd Year — Semester 3 (8 unique rows: the given Lab list is a
  -- pure subset of the given Notes list, all 5 lab entries share a
  -- row with their notes counterpart).
  -- ============================================================
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_branch_id, null, v_y2s3, 'Analytical Techniques', 'biotech-analytical-techniques', 1),
    (v_branch_id, null, v_y2s3, 'Biochemistry', 'biotech-biochemistry', 2),
    (v_branch_id, null, v_y2s3, 'Biostatistics', 'biotech-biostatistics', 3),
    (v_branch_id, null, v_y2s3, 'Cell & Molecular Biology', 'biotech-cell-and-molecular-biology', 4),
    (v_branch_id, null, v_y2s3, 'Enzyme Engineering', 'biotech-enzyme-engineering', 5),
    (v_branch_id, null, v_y2s3, 'Microbiology', 'biotech-microbiology', 6),
    (v_branch_id, null, v_y2s3, 'Linux & PERL Programming', 'biotech-linux-and-perl-programming', 7),
    (v_branch_id, null, v_y2s3, 'Basics of Food and Nutrition', 'biotech-basics-of-food-and-nutrition', 8);
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from subjects
  where branch_id = (select id from branches where slug = 'biotechnology');
  if v_count != 26 then
    raise exception 'expected exactly 26 Biotechnology subjects, got %', v_count;
  end if;
end $$;

commit;
