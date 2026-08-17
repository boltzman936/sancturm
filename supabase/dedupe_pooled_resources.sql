-- One-time cleanup: removes exact duplicate resource rows created by
-- the Core+AIML-pooled initialization migrations (Civil/Mechanical/
-- Automation & Robotics' own Sem 2, and Biotechnology's Sem 1 — both
-- source from BOTH CSE Core and CSE AIML, and Core/AIML happened to
-- have uploaded the exact same file under the exact same title for
-- several subjects, so each pooled subject ended up with two
-- genuinely identical-looking rows: same title, same file_url, same
-- subject/branch, same resource_type). Every one of the 37 rows below
-- is a byte-for-byte duplicate (same file_url, meaning the same
-- underlying storage object) of another row that stays untouched —
-- nothing is lost, no file is deleted from storage, only the redundant
-- second copy of each pair is removed. Identified via:
--
--   select subject_id, title, file_url, resource_type, count(*)
--   from resources group by subject_id, title, file_url, resource_type
--   having count(*) > 1;
--
-- which returned exactly these 37 rows (the newer-created half of each
-- pair) — the row from each pair with the earliest created_at is kept.

begin;

delete from resources
where id in (
  '6cf507cf-9e18-483b-a3a5-981bed918d5c'::uuid,
  'd5880cbe-065f-4757-aa92-b0c8474035e0'::uuid,
  'cce95e72-b052-48f9-ba65-5b8ab3310fd4'::uuid,
  'f70c4671-ca53-4741-bda3-957464da4896'::uuid,
  'e54b2375-aa00-469a-9841-70ff2c06256d'::uuid,
  'e5cd1761-abd8-4bdc-bfc5-f5119a72856f'::uuid,
  'e06290f9-7774-42d4-900b-5c329a63ab3f'::uuid,
  'a4b4b3b9-1bea-4eaf-9aeb-c847fd123d3b'::uuid,
  'fbfe39d8-2143-4b8e-8c16-2feae2417959'::uuid,
  'b1b0d54f-fd8b-4994-8b3c-49651d07749e'::uuid,
  '6258f520-9ff7-4c1a-ab40-21d6579f5836'::uuid,
  'eb22a5c1-0c04-47f0-a18c-5c5ea08bc950'::uuid,
  'eb9db7b6-727e-4641-82d6-8d6b430c6104'::uuid,
  'cbb98b59-52ad-4fd2-9ee2-a1f616882ece'::uuid,
  '6ba28944-371e-4337-bda4-6efd66da6a7d'::uuid,
  'de7e8f26-bbb4-4a70-a9ac-c9f5405b0425'::uuid,
  'fa8ff583-c2f5-40b3-a65d-db5bfa87b662'::uuid,
  'dffc7df1-f6bf-49f0-9983-320ff681092c'::uuid,
  'c9fc3e62-c841-4631-9447-97a5ca809ae0'::uuid,
  'aaac9c56-29e1-47bd-b0ea-343d7daed9b8'::uuid,
  'b7b8c625-c5df-4047-a325-28d1db6a7b46'::uuid,
  '20e2d1d5-15cc-4056-ac32-738365d5e5c8'::uuid,
  '7bdfe356-447f-4aba-8d88-66ba5c9ab220'::uuid,
  'ec3eb99b-2b5f-4f42-a7f5-0f6dc260eb13'::uuid,
  '7c2ee621-3a82-4f41-8314-8c77b74d7c7d'::uuid,
  '31b82492-962b-47f5-b8dc-9e34f8b51ec3'::uuid,
  '9cf2c4a7-a373-4cd2-a00b-099294434e7f'::uuid,
  'af807dd2-96f3-4cb9-b078-9fab93bfd79e'::uuid,
  'f0f0429d-37a0-4132-bc36-3da97568b3eb'::uuid,
  'c7a38821-d823-4218-aa4b-2e804fa0f15d'::uuid,
  'f12aca8a-8c71-440f-9872-565d8b1d9520'::uuid,
  '83db1242-744e-4812-a02f-ca23d8748423'::uuid,
  'cb00f882-301c-4d4d-9d2d-7016808071f4'::uuid,
  'd030b63b-af72-4598-ad4a-f3bf9b09abce'::uuid,
  'f06c621b-143b-47f6-a013-776b47ec6c89'::uuid,
  '94668201-91a1-4f99-b18b-6ce20b799a74'::uuid,
  'fc594885-61c3-4eae-b7b7-47b9968da801'::uuid
);

commit;
