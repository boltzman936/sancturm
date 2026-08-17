-- Second named exception, added to the same cr_current_term_id
-- function exclude_sem2_core_aiml_aids.sql introduced (same 3-arg
-- signature — a pure body change, so nothing that calls it needs to
-- change): CSE Cyber Security didn't exist before the 2026-27 batch
-- (see supabase/expand_branch_hierarchy.sql — inserted brand new,
-- with no 2025-26 history of its own), but batch_terms is globally
-- shared, so without this it silently inherited the EXISTING 2025-26
-- batch's rows the moment it was created. Every batch OTHER than
-- 2026-27 is now hidden for it entirely; mirrors
-- src/features/batches/academicChronology.ts's own comment on this —
-- keep the two in sync if this ever changes.

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
          bt.batch_id = '2f2d1232-76ea-4a42-a744-e9be040158e3'
          and bt.term_id = 'f9699ad2-6f0c-469e-9b28-e59ef838d889'
          and p_specialization_id is not null and p_specialization_id in (
            '67e55583-69ed-4a50-9aad-256fdff9fec1',
            '09b06a94-bcf3-41c2-9858-0ec5cb6b647a',
            'f581246d-6feb-4095-aa33-e82e88a1de3f'
          )
        )
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
          bt.batch_id = '2f2d1232-76ea-4a42-a744-e9be040158e3'
          and bt.term_id = 'f9699ad2-6f0c-469e-9b28-e59ef838d889'
          and p_specialization_id is not null and p_specialization_id in (
            '67e55583-69ed-4a50-9aad-256fdff9fec1',
            '09b06a94-bcf3-41c2-9858-0ec5cb6b647a',
            'f581246d-6feb-4095-aa33-e82e88a1de3f'
          )
        )
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
