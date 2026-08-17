-- Adds "Elementary English I" (1st Year Sem 1) and "Elementary
-- English II" (1st Year Sem 2) to Biotechnology's subject list.
-- Notes-only, same as Elementary Mathematics I/II — no lab
-- counterpart given. No batch_id involved (subjects aren't
-- batch-scoped) — Sem 2's row is automatically visible only to
-- whichever batch has actually reached 1st Year Sem 2 today (2025-26;
-- 2026-27 hasn't yet), same as every other Sem-2 Biotechnology
-- subject already added.

begin;

do $$
declare
  v_branch_id uuid;
  v_y1s1 uuid;
  v_y1s2 uuid;
begin
  select id into v_branch_id from branches where slug = 'biotechnology';
  select id into v_y1s1 from academic_terms where slug = 'y1-s1';
  select id into v_y1s2 from academic_terms where slug = 'y1-s2';

  insert into subjects (branch_id, specialization_id, term_id, name, slug, sort_order) values
    (v_branch_id, null, v_y1s1, 'Elementary English I', 'biotech-elementary-english-i', 11),
    (v_branch_id, null, v_y1s2, 'Elementary English II', 'biotech-elementary-english-ii', 9);
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from subjects
  where branch_id = (select id from branches where slug = 'biotechnology')
    and slug in ('biotech-elementary-english-i', 'biotech-elementary-english-ii');
  if v_count != 2 then
    raise exception 'expected exactly 2 new rows, got %', v_count;
  end if;
end $$;

commit;
