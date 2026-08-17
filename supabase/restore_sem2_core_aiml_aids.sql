-- Reverses exclude_sem2_core_aiml_aids.sql's Core/AIML/AIDS clause —
-- per explicit correction, 1st Year Sem 2 is now available for the
-- 2025-26 batch for these three specializations, same as every other
-- reached semester. Its SUBJECT LIST is resolved from Sem 1's real
-- subjects via the interchange mapping at the application layer (see
-- src/features/resources/subjectInterchange.ts's
-- resolveSubjectQueryTermSlug) — nothing here needs to know about
-- that; this function only ever answered "is this (batch, term) even
-- visible for this specialization," never "which subjects does it
-- show."
--
-- Cyber Security's own exclusion (exclude_pre_2026_cyber_security.sql)
-- is untouched — same signature, so nothing that calls
-- cr_current_term_id needs to change.

begin;

create or replace function cr_current_term_id(p_batch_id uuid, p_year_number integer, p_specialization_id uuid)
returns uuid
language sql
stable
as $$
  select coalesce(
    (
      select bt.term_id
      from batch_terms bt
      join academic_terms t on t.id = bt.term_id
      where bt.batch_id = p_batch_id
        and t.year_number = p_year_number
        and bt.start_date <= current_date
        and not (
          p_specialization_id is not distinct from 'ab74984a-a34a-4b9b-9119-79b1de0f3a98'
          and bt.batch_id <> 'f4c959e8-e921-4e6e-b37b-f28e80cad145'
        )
      order by bt.start_date desc
      limit 1
    ),
    (
      select bt.term_id
      from batch_terms bt
      join academic_terms t on t.id = bt.term_id
      where bt.batch_id = p_batch_id
        and t.year_number = p_year_number
        and not (
          p_specialization_id is not distinct from 'ab74984a-a34a-4b9b-9119-79b1de0f3a98'
          and bt.batch_id <> 'f4c959e8-e921-4e6e-b37b-f28e80cad145'
        )
      order by bt.start_date asc
      limit 1
    )
  );
$$;

commit;
