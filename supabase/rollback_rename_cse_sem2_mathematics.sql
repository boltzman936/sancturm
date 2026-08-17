begin;

update subjects set name = 'Mathematics I'
where id in (
  '0946aebb-dc6b-404c-ad12-6122170c5612',
  'cb677898-d347-4c1b-baaa-0858735ad852',
  'a62c5ac4-0947-40c9-a93b-f2292219693a'
);

commit;
