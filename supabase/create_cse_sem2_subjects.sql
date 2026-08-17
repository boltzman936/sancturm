-- Restructure: CSE Core/AIML/AIDS's 1st-Year Sem 2 now has its own
-- REAL, permanent subject rows — not a runtime redirect to Sem 1 (see
-- git history for that approach, now removed). One-time clone of the
-- existing interchange rule's target curriculum (Core/AIML -> AIDS's
-- Sem 1 subjects; AIDS -> Core's Sem 1 subjects), reusing the exact
-- same names/slugs/sort_order as the source — safe because the
-- subjects table's uniqueness constraint is (specialization_id,
-- term_id, slug), so reusing a slug under a different
-- specialization/term is not a collision. After this, Sem 2's subject
-- list for each specialization is independent, explicit data, exactly
-- like every other branch's subjects.

begin;

do $$
declare
  v_cse_branch uuid;
  v_core uuid;
  v_aiml uuid;
  v_aids uuid;
  v_y1s1 uuid;
  v_y1s2 uuid;
begin
  select id into v_cse_branch from branches where slug = 'cse';
  select id into v_core from specializations where branch_id = v_cse_branch and name = 'CSE Core';
  select id into v_aiml from specializations where branch_id = v_cse_branch and name = 'CSE AIML';
  select id into v_aids from specializations where branch_id = v_cse_branch and name = 'CSE AIDS';
  select id into v_y1s1 from academic_terms where slug = 'y1-s1';
  select id into v_y1s2 from academic_terms where slug = 'y1-s2';

  -- CSE Core's Sem 2 = CSE AIDS's Sem 1 curriculum (own rows now)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order)
  select v_cse_branch, v_core, v_y1s2, name, slug, sort_order
  from subjects
  where specialization_id = v_aids and term_id = v_y1s1;

  -- CSE AIML's Sem 2 = CSE AIDS's Sem 1 curriculum (own rows now)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order)
  select v_cse_branch, v_aiml, v_y1s2, name, slug, sort_order
  from subjects
  where specialization_id = v_aids and term_id = v_y1s1;

  -- CSE AIDS's Sem 2 = CSE Core's Sem 1 curriculum (own rows now)
  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order)
  select v_cse_branch, v_aids, v_y1s2, name, slug, sort_order
  from subjects
  where specialization_id = v_core and term_id = v_y1s1;
end $$;

commit;
