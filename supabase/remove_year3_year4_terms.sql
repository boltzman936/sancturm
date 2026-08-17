-- Reverts the Year 3-4 / Sem 5-8 academic shell added by
-- expand_branch_hierarchy.sql — never requested; Sancturm currently
-- supports only 1st Year (Sem 1-2) and 2nd Year (Sem 3-4), for every
-- branch. Confirmed zero subjects/resources/notices/cr_profiles
-- reference any of these four terms (checked live before writing
-- this) — this is a pure removal of empty shell rows, nothing real
-- gets deleted. batch_terms rows for these terms cascade-deleted
-- automatically (term_id references academic_terms(id) on delete
-- cascade), but deleted explicitly here too for clarity.
--
-- Because academic_terms/batch_terms are global (no branch_id column
-- at all — confirmed in expand_branch_hierarchy.sql), this one
-- deletion removes Year 3/4 from every branch/specialization
-- everywhere in the app — Cockpit, Sidebar, Notes, Lab, PYQs, Upload,
-- Manage, Edit, and every server-side chronology check all resolve
-- from these same two tables, so there is nothing else to change.

begin;

delete from batch_terms
where term_id in (
  select id from academic_terms where slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8')
);

delete from academic_terms where slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8');

do $$
declare
  term_count int;
  bt_count int;
begin
  select count(*) into term_count from academic_terms where slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8');
  select count(*) into bt_count from batch_terms bt
    join academic_terms t on t.id = bt.term_id
    where t.slug in ('y3-s5', 'y3-s6', 'y4-s7', 'y4-s8');
  if term_count != 0 then raise exception 'Year 3/4 terms still present after delete'; end if;
  if bt_count != 0 then raise exception 'Year 3/4 batch_terms still present after delete'; end if;

  -- Confirm the 8 original terms are still intact.
  if (select count(*) from academic_terms) != 4 then
    raise exception 'expected exactly 4 academic_terms remaining, got %', (select count(*) from academic_terms);
  end if;
end $$;

commit;
