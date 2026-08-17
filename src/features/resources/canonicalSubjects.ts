// Explicit, ID-based pairing declaring which CSE subject a mirroring
// branch's own subject is academically the same as, for READ-time
// content sharing (see sharedResourceScopes.ts) — Civil/Mechanical/
// Automation & Robotics's 1st Year curriculum mirrors CSE's own, so
// existing content uploaded under the CSE side should surface under
// the equivalent subject here too, without any name/string comparison
// at query or display time. A subject can be renamed on either side
// (see "Engineering Mathematics II", not a name variant of anything —
// it's paired directly with Mathematics I by id) without this ever
// breaking, and two subjects that happen to share a name by
// coincidence can never falsely match, because nothing here compares
// names at all.
//
// Key: the mirroring branch's own subject_id. Value: the CSE
// subject_id(s) it's canonically the same as. 1st Year Sem 1 maps to
// exactly one CSE AIDS subject; Sem 2 maps to TWO (CSE Core's AND CSE
// AIML's) since Core and AIML share an identical Sem 1 subject list —
// the same grouping subjectInterchange.ts's own swap treats as one
// unit — and each has its own separate real uploads under it.
//
// IDs captured directly from the live `subjects` table (see
// supabase/add_civil_mechanical_automation_*.sql for how these rows
// were created) — this table mirrors curriculum-equivalence data, not
// logic, so it only ever needs a one-line update when a mirrored
// subject is added, renamed, or removed, never when query code
// changes.
export const CANONICAL_SUBJECT_MAP: Record<string, string[]> = {
  // Civil — 1st Year Sem 1 (mirrors CSE AIDS Sem 1)
  "9ef5453c-c17b-4c28-a97c-b9db0df5f9b8": ["6626257b-1b55-46ce-977b-ab7e856936d9"], // Engineering Mathematics I -> Mathematics I
  "6e5da8be-d4d3-45c3-9608-c1335b6193fe": ["a2b644d5-02af-4231-a085-73082ee2839f"], // C Programming
  "1d185c7a-173e-42b5-a607-efff9606ebb2": ["1fc54f12-d90e-46b2-84b5-e12ad7c55c05"], // Digital Electronics
  "4a955865-4c4e-4b07-a465-c169947e5894": ["87619f79-6d33-4cc3-8ecd-7e27409d3892"], // Professional Communication
  "0e01261a-6042-4aa6-b146-13a8aabe4023": ["d064ced8-5d93-4c0b-ae00-6af15cdf9962"], // Manufacturing
  "b9246c85-852c-401c-8be0-f96edf7a7238": ["a671780f-b409-496d-9cc5-991ad226d7e8"], // Elementary English
  "8b85c00f-0fbd-4bd4-a73d-8741d1dfd30a": ["d32f9037-6bef-47d6-85ad-392f7c0983e9"], // Soft Skill
  "56dcf98d-61a4-4aef-a1b4-042bf58f78d8": ["595d065b-ea90-43b2-b3e3-a0da2b8782dd"], // Engineering Chemistry

  // Civil — 1st Year Sem 2 (mirrors CSE Core + CSE AIML Sem 1, pooled)
  "94b05450-cff0-4bae-ac26-bdb387893bef": [
    "0dfdb211-1d77-40ed-92c0-290d0a9bd881", // Mathematics I (CSE Core)
    "0174e933-0a7d-4d6c-888d-0a6ee042edb7", // Mathematics I (CSE AIML)
  ],
  "2a5fe31e-6671-43c3-a93f-fb9201249ad4": [
    "a8cf8505-60fc-46f3-b191-c1532492415f", // Engineering Mechanics (CSE Core)
    "6d441c1a-8322-40df-a120-7efbd1895925", // Engineering Mechanics (CSE AIML)
  ],
  "1089af9e-147a-4284-9b1d-20d6a9a37738": [
    "3943f897-090f-430f-9588-33ab9ed38cbd", // Electrical Engineering (CSE Core)
    "d80a6bb0-7848-416a-b610-fb1090495f85", // Electrical Engineering (CSE AIML)
  ],
  "d3331873-fa1b-4b18-93d8-e3d405d8a00b": [
    "cc8fa343-c36f-4d0a-85da-b60eb45e0a1f", // Engineering Physics (CSE Core)
    "edd9243f-cc86-458d-9c83-ee226281b1f4", // Engineering Physics (CSE AIML)
  ],
  "42783a9b-d047-4294-8ed1-cd952d8fbb92": [
    "fec8d670-cf99-4080-a584-4c6133ce2013", // Environmental Science (CSE Core)
    "73e5f8ba-a68f-487c-89a2-4b97e623661a", // Environmental Science (CSE AIML)
  ],
  "e809026b-8f29-4b4d-bee4-878c273c31e0": [
    "0fcc9438-8877-4212-b421-906209c8d195", // Elementary English (CSE Core)
    "c51320de-9085-4ecd-b09f-aae9346a6121", // Elementary English (CSE AIML)
  ],
  "a3b0eda5-502f-41c8-9d67-17e2bf1c0ae5": [
    "20c2de26-6ac8-4ab5-89e5-e999b797f754", // Design and Thinking (CSE Core)
    "98acbf8a-659d-4873-8c30-45b1f680f85a", // Design and Thinking (CSE AIML)
  ],
  "0a3b3590-928d-4b5f-a9b9-c8c624ac5d37": [
    "f609cb45-1168-4e19-b7ba-72985a5d8ecb", // Engineering Graphics (CSE Core)
    "7cf989e8-9095-4cba-aa7b-948388360872", // Engineering Graphics (CSE AIML)
  ],

  // Mechanical — 1st Year Sem 1 (mirrors CSE AIDS Sem 1)
  "76979422-2f62-4d46-a8ae-c95e14b74203": ["6626257b-1b55-46ce-977b-ab7e856936d9"], // Engineering Mathematics I -> Mathematics I
  "7e848486-e7f2-466f-8f4d-8f7f7c67ef17": ["a2b644d5-02af-4231-a085-73082ee2839f"], // C Programming
  "9123d780-98a5-430d-9ca4-d2bbd51c3b68": ["1fc54f12-d90e-46b2-84b5-e12ad7c55c05"], // Digital Electronics
  "c3a8dbdb-0a35-429a-8674-c74a109ab29c": ["87619f79-6d33-4cc3-8ecd-7e27409d3892"], // Professional Communication
  "ec05b21c-4db9-48cd-b7cb-d5be866ac832": ["d064ced8-5d93-4c0b-ae00-6af15cdf9962"], // Manufacturing
  "34c8a426-08ed-4756-bbad-d882e5d2e9a4": ["a671780f-b409-496d-9cc5-991ad226d7e8"], // Elementary English
  "cdb3ac97-c338-4305-9fba-df4b2a0c3ad4": ["d32f9037-6bef-47d6-85ad-392f7c0983e9"], // Soft Skill
  "340115e8-0b78-477c-8a86-7db6ca6f0d94": ["595d065b-ea90-43b2-b3e3-a0da2b8782dd"], // Engineering Chemistry

  // Mechanical — 1st Year Sem 2 (mirrors CSE Core + CSE AIML Sem 1, pooled)
  "3e3281e7-ea22-4a9b-b609-fdf3c979987f": [
    "0dfdb211-1d77-40ed-92c0-290d0a9bd881", // Mathematics I (CSE Core)
    "0174e933-0a7d-4d6c-888d-0a6ee042edb7", // Mathematics I (CSE AIML)
  ],
  "280a3da3-6375-488d-aa92-597c09271943": [
    "a8cf8505-60fc-46f3-b191-c1532492415f", // Engineering Mechanics (CSE Core)
    "6d441c1a-8322-40df-a120-7efbd1895925", // Engineering Mechanics (CSE AIML)
  ],
  "e6c2a6e3-2f36-4ce3-aee4-686a05bb8adc": [
    "3943f897-090f-430f-9588-33ab9ed38cbd", // Electrical Engineering (CSE Core)
    "d80a6bb0-7848-416a-b610-fb1090495f85", // Electrical Engineering (CSE AIML)
  ],
  "1e0aab0f-b9a4-4026-a653-426e9cdf4f2c": [
    "cc8fa343-c36f-4d0a-85da-b60eb45e0a1f", // Engineering Physics (CSE Core)
    "edd9243f-cc86-458d-9c83-ee226281b1f4", // Engineering Physics (CSE AIML)
  ],
  "decc87d7-275a-496c-b56f-909f0a6b055d": [
    "fec8d670-cf99-4080-a584-4c6133ce2013", // Environmental Science (CSE Core)
    "73e5f8ba-a68f-487c-89a2-4b97e623661a", // Environmental Science (CSE AIML)
  ],
  "7e8f1f66-6b9b-4f55-b56f-3604924741d8": [
    "0fcc9438-8877-4212-b421-906209c8d195", // Elementary English (CSE Core)
    "c51320de-9085-4ecd-b09f-aae9346a6121", // Elementary English (CSE AIML)
  ],
  "30e8d687-cdd1-4b66-96d1-2a052f120954": [
    "20c2de26-6ac8-4ab5-89e5-e999b797f754", // Design and Thinking (CSE Core)
    "98acbf8a-659d-4873-8c30-45b1f680f85a", // Design and Thinking (CSE AIML)
  ],
  "2cf958d1-dbe1-408a-a3a7-9587704262eb": [
    "f609cb45-1168-4e19-b7ba-72985a5d8ecb", // Engineering Graphics (CSE Core)
    "7cf989e8-9095-4cba-aa7b-948388360872", // Engineering Graphics (CSE AIML)
  ],

  // Automation & Robotics — 1st Year Sem 1 (mirrors CSE AIDS Sem 1)
  "0e685eec-b2ae-4a70-acf6-f4944220f3ed": ["6626257b-1b55-46ce-977b-ab7e856936d9"], // Engineering Mathematics I -> Mathematics I
  "b830fe44-1e9e-4455-be09-b5aa0f031d38": ["a2b644d5-02af-4231-a085-73082ee2839f"], // C Programming
  "100b6e81-7de6-49e2-9369-7bfa8081dffb": ["1fc54f12-d90e-46b2-84b5-e12ad7c55c05"], // Digital Electronics
  "2fc7ad5b-47f1-4ea9-bae0-eaf2c975c7c1": ["87619f79-6d33-4cc3-8ecd-7e27409d3892"], // Professional Communication
  "929d23d4-53af-4048-b53c-de945640cad8": ["d064ced8-5d93-4c0b-ae00-6af15cdf9962"], // Manufacturing
  "82edcba8-29e6-4692-a55a-8a3f4d4b7d73": ["a671780f-b409-496d-9cc5-991ad226d7e8"], // Elementary English
  "2c40de23-1fdd-4179-a56a-ffa102550272": ["d32f9037-6bef-47d6-85ad-392f7c0983e9"], // Soft Skill
  "82a019ea-52fe-44d0-b913-138e58b91245": ["595d065b-ea90-43b2-b3e3-a0da2b8782dd"], // Engineering Chemistry

  // Automation & Robotics — 1st Year Sem 2 (mirrors CSE Core + CSE AIML Sem 1, pooled)
  "534e380d-4386-480e-b294-37987ef4cf90": [
    "0dfdb211-1d77-40ed-92c0-290d0a9bd881", // Mathematics I (CSE Core)
    "0174e933-0a7d-4d6c-888d-0a6ee042edb7", // Mathematics I (CSE AIML)
  ],
  "307951cc-e8d2-4f00-9027-930bfd2c06e4": [
    "a8cf8505-60fc-46f3-b191-c1532492415f", // Engineering Mechanics (CSE Core)
    "6d441c1a-8322-40df-a120-7efbd1895925", // Engineering Mechanics (CSE AIML)
  ],
  "8ea679c3-2972-43cf-9dbb-ddb0f7521451": [
    "3943f897-090f-430f-9588-33ab9ed38cbd", // Electrical Engineering (CSE Core)
    "d80a6bb0-7848-416a-b610-fb1090495f85", // Electrical Engineering (CSE AIML)
  ],
  "a443f9ba-ae13-4630-b4e4-76dc984d46bd": [
    "cc8fa343-c36f-4d0a-85da-b60eb45e0a1f", // Engineering Physics (CSE Core)
    "edd9243f-cc86-458d-9c83-ee226281b1f4", // Engineering Physics (CSE AIML)
  ],
  "579eac80-a004-4aca-a5fc-abd36280c4e0": [
    "fec8d670-cf99-4080-a584-4c6133ce2013", // Environmental Science (CSE Core)
    "73e5f8ba-a68f-487c-89a2-4b97e623661a", // Environmental Science (CSE AIML)
  ],
  "f5e5ea03-357e-495e-b477-82b860843d58": [
    "0fcc9438-8877-4212-b421-906209c8d195", // Elementary English (CSE Core)
    "c51320de-9085-4ecd-b09f-aae9346a6121", // Elementary English (CSE AIML)
  ],
  "a8747309-689b-4f6e-9503-8823f9ba2404": [
    "20c2de26-6ac8-4ab5-89e5-e999b797f754", // Design and Thinking (CSE Core)
    "98acbf8a-659d-4873-8c30-45b1f680f85a", // Design and Thinking (CSE AIML)
  ],
  "cde92102-22a1-4846-a554-b226764ce24a": [
    "f609cb45-1168-4e19-b7ba-72985a5d8ecb", // Engineering Graphics (CSE Core)
    "7cf989e8-9095-4cba-aa7b-948388360872", // Engineering Graphics (CSE AIML)
  ],
};

/** The CSE subject id(s) `subjectId` is canonically the same as, or empty if none is registered. */
export function getCanonicalSourceSubjectIds(subjectId: string): string[] {
  return CANONICAL_SUBJECT_MAP[subjectId] ?? [];
}
