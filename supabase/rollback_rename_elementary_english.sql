begin;

update subjects set name = 'Elementary English'
where id in (
  '0fcc9438-8877-4212-b421-906209c8d195',
  'c51320de-9085-4ecd-b09f-aae9346a6121',
  'a671780f-b409-496d-9cc5-991ad226d7e8',
  'f6d67814-ae63-41e5-b956-f49e90fdce62',
  '6efdb858-0a10-415f-9451-14623dd60b36',
  'c353516a-144b-44f6-a927-69589188681e'
);

commit;
