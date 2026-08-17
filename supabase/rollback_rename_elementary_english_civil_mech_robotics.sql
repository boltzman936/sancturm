begin;

update subjects set name = 'Elementary English'
where id in (
  '82edcba8-29e6-4692-a55a-8a3f4d4b7d73',
  'b9246c85-852c-401c-8be0-f96edf7a7238',
  '34c8a426-08ed-4756-bbad-d882e5d2e9a4',
  'f5e5ea03-357e-495e-b477-82b860843d58',
  'e809026b-8f29-4b4d-bee4-878c273c31e0',
  '7e8f1f66-6b9b-4f55-b56f-3604924741d8'
);

commit;
