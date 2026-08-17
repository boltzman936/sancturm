begin;

delete from subjects
where branch_id = (select id from branches where slug = 'cse')
  and term_id = (select id from academic_terms where slug = 'y1-s2');

commit;
