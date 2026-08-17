begin;

delete from subjects
where branch_id in (
  select id from branches where slug in ('civil', 'mechanical', 'automation-robotics')
)
and slug like '%-s2-%';

commit;
