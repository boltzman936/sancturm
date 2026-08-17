-- One-time initialization: for each explicitly paired (target
-- subject, source subject) academic-equivalence — CSE Core/AIML/AIDS's
-- own Sem 2 curriculum, and Civil/Mechanical/Automation & Robotics's
-- mirrored 1st Year curriculum — copy every existing, genuine 2025-26
-- resource (legacy_shared = true; excludes anything uploaded after
-- this restructure) from the source subject into a NEW, independent
-- resource row under the target's own academic context. Same file_url
-- (no physical file duplication in storage); a fresh row, fresh id,
-- target's own branch/specialization/term/subject, reset engagement
-- counters (is_pinned/ratings/counts default to their normal
-- defaults — those belong to the specific context they accrue in, not
-- copied from the source). After this migration, every target
-- resource is a completely independent record — editing, deleting, or
-- re-uploading in one context never touches another.
--
-- This is a ONE-TIME data migration, not a live resolver. The pairing
-- data itself matches the interchange/mirroring rules already
-- established this session (Core/AIML's Sem 2 <-> AIDS's Sem 1; AIDS's
-- Sem 2 <-> Core's Sem 1; Civil/Mechanical/Automation & Robotics's Sem
-- 1 <-> CSE AIDS's Sem 1; their Sem 2 <-> CSE Core's + CSE AIML's Sem
-- 1, pooled) — no new mapping invented.

begin;

with subject_pairs (target_subject_id, source_subject_id) as (
  values
  ('a62c5ac4-0947-40c9-a93b-f2292219693a'::uuid, '6626257b-1b55-46ce-977b-ab7e856936d9'::uuid), -- Core Mathematics I <- AIDS Mathematics I
  ('319474d1-e12e-4c03-abe8-1d6a385f089d'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- Core C Programming <- AIDS C Programming
  ('c3c910fb-2dd4-4647-84e0-0f32199df036'::uuid, '1fc54f12-d90e-46b2-84b5-e12ad7c55c05'::uuid), -- Core Digital Electronics <- AIDS Digital Electronics
  ('9edc4280-79ec-4fa6-a553-6bebe34cd50f'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- Core Professional Communication <- AIDS Professional Communication
  ('8fb132e3-787f-4b04-9cd6-e8586de9c864'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- Core Manufacturing <- AIDS Manufacturing
  ('f6d67814-ae63-41e5-b956-f49e90fdce62'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid), -- Core Elementary English <- AIDS Elementary English
  ('64f22f13-8da9-4fa5-b6de-7423b0493588'::uuid, 'd32f9037-6bef-47d6-85ad-392f7c0983e9'::uuid), -- Core Soft Skill <- AIDS Soft Skill
  ('71da5d85-1b66-441f-8899-edc2a7b75225'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- Core Engineering Chemistry <- AIDS Engineering Chemistry
  ('cb677898-d347-4c1b-baaa-0858735ad852'::uuid, '6626257b-1b55-46ce-977b-ab7e856936d9'::uuid), -- AIML Mathematics I <- AIDS Mathematics I
  ('283762dd-70eb-42d1-8def-e2a7b5cd7cc0'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- AIML C Programming <- AIDS C Programming
  ('187d19ce-3bb4-4587-9ae9-b3369dcb45f5'::uuid, '1fc54f12-d90e-46b2-84b5-e12ad7c55c05'::uuid), -- AIML Digital Electronics <- AIDS Digital Electronics
  ('68bd2ecd-3949-4b7a-a5f2-f0bdfbf7247b'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- AIML Professional Communication <- AIDS Professional Communication
  ('359bba76-835e-4c73-9b97-e2b9d0218577'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- AIML Manufacturing <- AIDS Manufacturing
  ('6efdb858-0a10-415f-9451-14623dd60b36'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid), -- AIML Elementary English <- AIDS Elementary English
  ('97120e2e-86f4-4f73-8cf7-c7dc1da078f2'::uuid, 'd32f9037-6bef-47d6-85ad-392f7c0983e9'::uuid), -- AIML Soft Skill <- AIDS Soft Skill
  ('e2c32352-a651-474e-83b9-d74e13f2ceb3'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- AIML Engineering Chemistry <- AIDS Engineering Chemistry
  ('0946aebb-dc6b-404c-ad12-6122170c5612'::uuid, '0dfdb211-1d77-40ed-92c0-290d0a9bd881'::uuid), -- AIDS Mathematics I <- Core Mathematics I
  ('cd992254-cffe-4528-b37c-1061703ee4ef'::uuid, 'a8cf8505-60fc-46f3-b191-c1532492415f'::uuid), -- AIDS Engineering Mechanics <- Core Engineering Mechanics
  ('07e3d58c-729e-4822-a534-2782eb7ea2df'::uuid, '3943f897-090f-430f-9588-33ab9ed38cbd'::uuid), -- AIDS Electrical Engineering <- Core Electrical Engineering
  ('4e3043dc-44da-4af8-b3c5-6f8d54a9cfee'::uuid, 'cc8fa343-c36f-4d0a-85da-b60eb45e0a1f'::uuid), -- AIDS Engineering Physics <- Core Engineering Physics
  ('8aa6ada0-876a-49af-ac8a-3506cccd9377'::uuid, 'fec8d670-cf99-4080-a584-4c6133ce2013'::uuid), -- AIDS Environmental Science <- Core Environmental Science
  ('c353516a-144b-44f6-a927-69589188681e'::uuid, '0fcc9438-8877-4212-b421-906209c8d195'::uuid), -- AIDS Elementary English <- Core Elementary English
  ('e4070687-3715-46d3-87aa-c6c7057789de'::uuid, '20c2de26-6ac8-4ab5-89e5-e999b797f754'::uuid), -- AIDS Design and Thinking <- Core Design and Thinking
  ('d904ae1f-4c71-4d3a-ba14-02667146e08c'::uuid, 'f609cb45-1168-4e19-b7ba-72985a5d8ecb'::uuid), -- AIDS Engineering Graphics <- Core Engineering Graphics
  ('9ef5453c-c17b-4c28-a97c-b9db0df5f9b8'::uuid, '6626257b-1b55-46ce-977b-ab7e856936d9'::uuid), -- Civil Engineering Mathematics I <- AIDS Mathematics I
  ('6e5da8be-d4d3-45c3-9608-c1335b6193fe'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- Civil C Programming <- AIDS C Programming
  ('1d185c7a-173e-42b5-a607-efff9606ebb2'::uuid, '1fc54f12-d90e-46b2-84b5-e12ad7c55c05'::uuid), -- Civil Digital Electronics <- AIDS Digital Electronics
  ('4a955865-4c4e-4b07-a465-c169947e5894'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- Civil Professional Communication <- AIDS Professional Communication
  ('0e01261a-6042-4aa6-b146-13a8aabe4023'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- Civil Manufacturing <- AIDS Manufacturing
  ('b9246c85-852c-401c-8be0-f96edf7a7238'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid), -- Civil Elementary English <- AIDS Elementary English
  ('8b85c00f-0fbd-4bd4-a73d-8741d1dfd30a'::uuid, 'd32f9037-6bef-47d6-85ad-392f7c0983e9'::uuid), -- Civil Soft Skill <- AIDS Soft Skill
  ('56dcf98d-61a4-4aef-a1b4-042bf58f78d8'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- Civil Engineering Chemistry <- AIDS Engineering Chemistry
  ('94b05450-cff0-4bae-ac26-bdb387893bef'::uuid, '0dfdb211-1d77-40ed-92c0-290d0a9bd881'::uuid), -- Civil Engineering Mathematics II <- Core Mathematics I
  ('94b05450-cff0-4bae-ac26-bdb387893bef'::uuid, '0174e933-0a7d-4d6c-888d-0a6ee042edb7'::uuid), -- Civil Engineering Mathematics II <- AIML Mathematics I
  ('2a5fe31e-6671-43c3-a93f-fb9201249ad4'::uuid, 'a8cf8505-60fc-46f3-b191-c1532492415f'::uuid), -- Civil Engineering Mechanics(S2) <- Core Engineering Mechanics
  ('2a5fe31e-6671-43c3-a93f-fb9201249ad4'::uuid, '6d441c1a-8322-40df-a120-7efbd1895925'::uuid), -- Civil Engineering Mechanics(S2) <- AIML Engineering Mechanics
  ('1089af9e-147a-4284-9b1d-20d6a9a37738'::uuid, '3943f897-090f-430f-9588-33ab9ed38cbd'::uuid), -- Civil Electrical Engineering(S2) <- Core Electrical Engineering
  ('1089af9e-147a-4284-9b1d-20d6a9a37738'::uuid, 'd80a6bb0-7848-416a-b610-fb1090495f85'::uuid), -- Civil Electrical Engineering(S2) <- AIML Electrical Engineering
  ('d3331873-fa1b-4b18-93d8-e3d405d8a00b'::uuid, 'cc8fa343-c36f-4d0a-85da-b60eb45e0a1f'::uuid), -- Civil Engineering Physics(S2) <- Core Engineering Physics
  ('d3331873-fa1b-4b18-93d8-e3d405d8a00b'::uuid, 'edd9243f-cc86-458d-9c83-ee226281b1f4'::uuid), -- Civil Engineering Physics(S2) <- AIML Engineering Physics
  ('42783a9b-d047-4294-8ed1-cd952d8fbb92'::uuid, 'fec8d670-cf99-4080-a584-4c6133ce2013'::uuid), -- Civil Environmental Science(S2) <- Core Environmental Science
  ('42783a9b-d047-4294-8ed1-cd952d8fbb92'::uuid, '73e5f8ba-a68f-487c-89a2-4b97e623661a'::uuid), -- Civil Environmental Science(S2) <- AIML Environmental Science
  ('e809026b-8f29-4b4d-bee4-878c273c31e0'::uuid, '0fcc9438-8877-4212-b421-906209c8d195'::uuid), -- Civil Elementary English(S2) <- Core Elementary English
  ('e809026b-8f29-4b4d-bee4-878c273c31e0'::uuid, 'c51320de-9085-4ecd-b09f-aae9346a6121'::uuid), -- Civil Elementary English(S2) <- AIML Elementary English
  ('a3b0eda5-502f-41c8-9d67-17e2bf1c0ae5'::uuid, '20c2de26-6ac8-4ab5-89e5-e999b797f754'::uuid), -- Civil Design and Thinking(S2) <- Core Design and Thinking
  ('a3b0eda5-502f-41c8-9d67-17e2bf1c0ae5'::uuid, '98acbf8a-659d-4873-8c30-45b1f680f85a'::uuid), -- Civil Design and Thinking(S2) <- AIML Design and Thinking
  ('0a3b3590-928d-4b5f-a9b9-c8c624ac5d37'::uuid, 'f609cb45-1168-4e19-b7ba-72985a5d8ecb'::uuid), -- Civil Engineering Graphics(S2) <- Core Engineering Graphics
  ('0a3b3590-928d-4b5f-a9b9-c8c624ac5d37'::uuid, '7cf989e8-9095-4cba-aa7b-948388360872'::uuid), -- Civil Engineering Graphics(S2) <- AIML Engineering Graphics
  ('76979422-2f62-4d46-a8ae-c95e14b74203'::uuid, '6626257b-1b55-46ce-977b-ab7e856936d9'::uuid), -- Mechanical Engineering Mathematics I <- AIDS Mathematics I
  ('7e848486-e7f2-466f-8f4d-8f7f7c67ef17'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- Mechanical C Programming <- AIDS C Programming
  ('9123d780-98a5-430d-9ca4-d2bbd51c3b68'::uuid, '1fc54f12-d90e-46b2-84b5-e12ad7c55c05'::uuid), -- Mechanical Digital Electronics <- AIDS Digital Electronics
  ('c3a8dbdb-0a35-429a-8674-c74a109ab29c'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- Mechanical Professional Communication <- AIDS Professional Communication
  ('ec05b21c-4db9-48cd-b7cb-d5be866ac832'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- Mechanical Manufacturing <- AIDS Manufacturing
  ('34c8a426-08ed-4756-bbad-d882e5d2e9a4'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid), -- Mechanical Elementary English <- AIDS Elementary English
  ('cdb3ac97-c338-4305-9fba-df4b2a0c3ad4'::uuid, 'd32f9037-6bef-47d6-85ad-392f7c0983e9'::uuid), -- Mechanical Soft Skill <- AIDS Soft Skill
  ('340115e8-0b78-477c-8a86-7db6ca6f0d94'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- Mechanical Engineering Chemistry <- AIDS Engineering Chemistry
  ('3e3281e7-ea22-4a9b-b609-fdf3c979987f'::uuid, '0dfdb211-1d77-40ed-92c0-290d0a9bd881'::uuid), -- Mechanical Engineering Mathematics II <- Core Mathematics I
  ('3e3281e7-ea22-4a9b-b609-fdf3c979987f'::uuid, '0174e933-0a7d-4d6c-888d-0a6ee042edb7'::uuid), -- Mechanical Engineering Mathematics II <- AIML Mathematics I
  ('280a3da3-6375-488d-aa92-597c09271943'::uuid, 'a8cf8505-60fc-46f3-b191-c1532492415f'::uuid), -- Mechanical Engineering Mechanics(S2) <- Core Engineering Mechanics
  ('280a3da3-6375-488d-aa92-597c09271943'::uuid, '6d441c1a-8322-40df-a120-7efbd1895925'::uuid), -- Mechanical Engineering Mechanics(S2) <- AIML Engineering Mechanics
  ('e6c2a6e3-2f36-4ce3-aee4-686a05bb8adc'::uuid, '3943f897-090f-430f-9588-33ab9ed38cbd'::uuid), -- Mechanical Electrical Engineering(S2) <- Core Electrical Engineering
  ('e6c2a6e3-2f36-4ce3-aee4-686a05bb8adc'::uuid, 'd80a6bb0-7848-416a-b610-fb1090495f85'::uuid), -- Mechanical Electrical Engineering(S2) <- AIML Electrical Engineering
  ('1e0aab0f-b9a4-4026-a653-426e9cdf4f2c'::uuid, 'cc8fa343-c36f-4d0a-85da-b60eb45e0a1f'::uuid), -- Mechanical Engineering Physics(S2) <- Core Engineering Physics
  ('1e0aab0f-b9a4-4026-a653-426e9cdf4f2c'::uuid, 'edd9243f-cc86-458d-9c83-ee226281b1f4'::uuid), -- Mechanical Engineering Physics(S2) <- AIML Engineering Physics
  ('decc87d7-275a-496c-b56f-909f0a6b055d'::uuid, 'fec8d670-cf99-4080-a584-4c6133ce2013'::uuid), -- Mechanical Environmental Science(S2) <- Core Environmental Science
  ('decc87d7-275a-496c-b56f-909f0a6b055d'::uuid, '73e5f8ba-a68f-487c-89a2-4b97e623661a'::uuid), -- Mechanical Environmental Science(S2) <- AIML Environmental Science
  ('7e8f1f66-6b9b-4f55-b56f-3604924741d8'::uuid, '0fcc9438-8877-4212-b421-906209c8d195'::uuid), -- Mechanical Elementary English(S2) <- Core Elementary English
  ('7e8f1f66-6b9b-4f55-b56f-3604924741d8'::uuid, 'c51320de-9085-4ecd-b09f-aae9346a6121'::uuid), -- Mechanical Elementary English(S2) <- AIML Elementary English
  ('30e8d687-cdd1-4b66-96d1-2a052f120954'::uuid, '20c2de26-6ac8-4ab5-89e5-e999b797f754'::uuid), -- Mechanical Design and Thinking(S2) <- Core Design and Thinking
  ('30e8d687-cdd1-4b66-96d1-2a052f120954'::uuid, '98acbf8a-659d-4873-8c30-45b1f680f85a'::uuid), -- Mechanical Design and Thinking(S2) <- AIML Design and Thinking
  ('2cf958d1-dbe1-408a-a3a7-9587704262eb'::uuid, 'f609cb45-1168-4e19-b7ba-72985a5d8ecb'::uuid), -- Mechanical Engineering Graphics(S2) <- Core Engineering Graphics
  ('2cf958d1-dbe1-408a-a3a7-9587704262eb'::uuid, '7cf989e8-9095-4cba-aa7b-948388360872'::uuid), -- Mechanical Engineering Graphics(S2) <- AIML Engineering Graphics
  ('0e685eec-b2ae-4a70-acf6-f4944220f3ed'::uuid, '6626257b-1b55-46ce-977b-ab7e856936d9'::uuid), -- Automation Engineering Mathematics I <- AIDS Mathematics I
  ('b830fe44-1e9e-4455-be09-b5aa0f031d38'::uuid, 'a2b644d5-02af-4231-a085-73082ee2839f'::uuid), -- Automation C Programming <- AIDS C Programming
  ('100b6e81-7de6-49e2-9369-7bfa8081dffb'::uuid, '1fc54f12-d90e-46b2-84b5-e12ad7c55c05'::uuid), -- Automation Digital Electronics <- AIDS Digital Electronics
  ('2fc7ad5b-47f1-4ea9-bae0-eaf2c975c7c1'::uuid, '87619f79-6d33-4cc3-8ecd-7e27409d3892'::uuid), -- Automation Professional Communication <- AIDS Professional Communication
  ('929d23d4-53af-4048-b53c-de945640cad8'::uuid, 'd064ced8-5d93-4c0b-ae00-6af15cdf9962'::uuid), -- Automation Manufacturing <- AIDS Manufacturing
  ('82edcba8-29e6-4692-a55a-8a3f4d4b7d73'::uuid, 'a671780f-b409-496d-9cc5-991ad226d7e8'::uuid), -- Automation Elementary English <- AIDS Elementary English
  ('2c40de23-1fdd-4179-a56a-ffa102550272'::uuid, 'd32f9037-6bef-47d6-85ad-392f7c0983e9'::uuid), -- Automation Soft Skill <- AIDS Soft Skill
  ('82a019ea-52fe-44d0-b913-138e58b91245'::uuid, '595d065b-ea90-43b2-b3e3-a0da2b8782dd'::uuid), -- Automation Engineering Chemistry <- AIDS Engineering Chemistry
  ('534e380d-4386-480e-b294-37987ef4cf90'::uuid, '0dfdb211-1d77-40ed-92c0-290d0a9bd881'::uuid), -- Automation Engineering Mathematics II <- Core Mathematics I
  ('534e380d-4386-480e-b294-37987ef4cf90'::uuid, '0174e933-0a7d-4d6c-888d-0a6ee042edb7'::uuid), -- Automation Engineering Mathematics II <- AIML Mathematics I
  ('307951cc-e8d2-4f00-9027-930bfd2c06e4'::uuid, 'a8cf8505-60fc-46f3-b191-c1532492415f'::uuid), -- Automation Engineering Mechanics(S2) <- Core Engineering Mechanics
  ('307951cc-e8d2-4f00-9027-930bfd2c06e4'::uuid, '6d441c1a-8322-40df-a120-7efbd1895925'::uuid), -- Automation Engineering Mechanics(S2) <- AIML Engineering Mechanics
  ('8ea679c3-2972-43cf-9dbb-ddb0f7521451'::uuid, '3943f897-090f-430f-9588-33ab9ed38cbd'::uuid), -- Automation Electrical Engineering(S2) <- Core Electrical Engineering
  ('8ea679c3-2972-43cf-9dbb-ddb0f7521451'::uuid, 'd80a6bb0-7848-416a-b610-fb1090495f85'::uuid), -- Automation Electrical Engineering(S2) <- AIML Electrical Engineering
  ('a443f9ba-ae13-4630-b4e4-76dc984d46bd'::uuid, 'cc8fa343-c36f-4d0a-85da-b60eb45e0a1f'::uuid), -- Automation Engineering Physics(S2) <- Core Engineering Physics
  ('a443f9ba-ae13-4630-b4e4-76dc984d46bd'::uuid, 'edd9243f-cc86-458d-9c83-ee226281b1f4'::uuid), -- Automation Engineering Physics(S2) <- AIML Engineering Physics
  ('579eac80-a004-4aca-a5fc-abd36280c4e0'::uuid, 'fec8d670-cf99-4080-a584-4c6133ce2013'::uuid), -- Automation Environmental Science(S2) <- Core Environmental Science
  ('579eac80-a004-4aca-a5fc-abd36280c4e0'::uuid, '73e5f8ba-a68f-487c-89a2-4b97e623661a'::uuid), -- Automation Environmental Science(S2) <- AIML Environmental Science
  ('f5e5ea03-357e-495e-b477-82b860843d58'::uuid, '0fcc9438-8877-4212-b421-906209c8d195'::uuid), -- Automation Elementary English(S2) <- Core Elementary English
  ('f5e5ea03-357e-495e-b477-82b860843d58'::uuid, 'c51320de-9085-4ecd-b09f-aae9346a6121'::uuid), -- Automation Elementary English(S2) <- AIML Elementary English
  ('a8747309-689b-4f6e-9503-8823f9ba2404'::uuid, '20c2de26-6ac8-4ab5-89e5-e999b797f754'::uuid), -- Automation Design and Thinking(S2) <- Core Design and Thinking
  ('a8747309-689b-4f6e-9503-8823f9ba2404'::uuid, '98acbf8a-659d-4873-8c30-45b1f680f85a'::uuid), -- Automation Design and Thinking(S2) <- AIML Design and Thinking
  ('cde92102-22a1-4846-a554-b226764ce24a'::uuid, 'f609cb45-1168-4e19-b7ba-72985a5d8ecb'::uuid), -- Automation Engineering Graphics(S2) <- Core Engineering Graphics
  ('cde92102-22a1-4846-a554-b226764ce24a'::uuid, '7cf989e8-9095-4cba-aa7b-948388360872'::uuid) -- Automation Engineering Graphics(S2) <- AIML Engineering Graphics
)
insert into resources (
  branch_id, specialization_id, term_id, batch_id, subject_id,
  section, resource_type, title, description, file_url, status,
  uploaded_by_device, uploaded_by_name, created_at
)
select
  target_subj.branch_id, target_subj.specialization_id, target_subj.term_id, r.batch_id, target_subj.id,
  r.section, r.resource_type, r.title, r.description, r.file_url, r.status,
  r.uploaded_by_device, r.uploaded_by_name, r.created_at
from resources r
join subject_pairs sp on sp.source_subject_id = r.subject_id
join subjects target_subj on target_subj.id = sp.target_subject_id
where r.legacy_shared = true;

commit;
