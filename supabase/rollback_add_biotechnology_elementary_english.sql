begin;

delete from subjects
where branch_id = (select id from branches where slug = 'biotechnology')
  and slug in ('biotech-elementary-english-i', 'biotech-elementary-english-ii');

commit;
