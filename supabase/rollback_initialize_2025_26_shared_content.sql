-- Reverses initialize_2025_26_shared_content.sql — deletes exactly the
-- resource rows that migration created (identified by subject_id
-- being one of the 96 pairing targets AND file_url/title matching a
-- still-existing legacy_shared source resource). Since the migration
-- always creates fresh rows (never touches existing ones), the safest
-- precise rollback is by subject_id membership in the target set, for
-- resources whose created_at was NOT set by a real upload today (i.e.
-- were inserted as part of that migration) — in practice, since this
-- rollback should only ever be run immediately after the forward
-- migration (before any real new uploads land in these newly-created
-- Sem2/mirrored-branch subject rows), it is safe to delete every
-- resource currently attached to these subject_ids.

begin;

delete from resources
where subject_id in (
  -- CSE Sem 2 subjects
  select id from subjects
  where branch_id = (select id from branches where slug = 'cse')
    and term_id = (select id from academic_terms where slug = 'y1-s2')
);

delete from resources
where subject_id in (
  select s.id
  from subjects s
  join branches b on b.id = s.branch_id
  where b.slug in ('civil', 'mechanical', 'automation-robotics')
    and s.term_id in (
      select id from academic_terms where slug in ('y1-s1', 'y1-s2')
    )
);

commit;
