-- Reverts cr_current_term_id's body back to exclude_sem2_core_aiml_
-- aids.sql's version (only the Core/AIML/AIDS Sem-2 exception, no
-- Cyber Security batch restriction). Same signature throughout, so
-- this is a pure body swap.

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
      order by bt.start_date asc
      limit 1
    )
  );
$$;

commit;
