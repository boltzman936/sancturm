// Not every subject has a lab component — only these do (per the CR's
// syllabus). There's no column for this on `subjects` yet, so this is
// a small hardcoded list, same tradeoff as the hardcoded BRANCHES
// lists elsewhere in the app. Slugs must match supabase/seed_subjects.sql
// (2nd Year - Semester 3), supabase/seed_year1_subjects.sql (1st Year -
// Semester 1, AIML/Core), supabase/fix_year1_aids_subjects.sql
// (1st Year - Semester 1, AIDS — a different subject list from
// AIML/Core), supabase/add_biotechnology_subjects.sql (all three
// Biotechnology semesters — see that file's own comment on which of
// its subjects are shared vs lab-only vs notes-only), and
// supabase/add_civil_mechanical_automation_sem1.sql (Civil/Mechanical/
// Automation & Robotics 1st Year Sem 1 — mirrors AIDS's exact Sem 1
// shape, just with Mathematics renamed),
// supabase/add_civil_mechanical_automation_sem2.sql (same 3 branches'
// 1st Year Sem 2 — mirrors AIML/Core's Sem 1 shape, not any CSE Sem 2
// curriculum, which is empty), and
// supabase/add_civil_mechanical_automation_sem3.sql (same 3 branches'
// 2nd Year Sem 3 — a real, distinct curriculum per branch, given
// directly, not mirrored from anything).
//
// These Sets are matched by slug ALONE, with no branch/term scoping —
// every Biotechnology/Civil/Mechanical/Automation & Robotics slug
// below is deliberately prefixed with its own branch so it can never
// collide with an existing (or future) slug from a different branch
// reusing a common subject name.
export const LAB_SUBJECT_SLUGS = new Set([
  // 2nd Year - Semester 3
  "dsa",
  "digital-electronics",
  "python",
  // 1st Year - Semester 1 — AIML / Core
  "engineering-mechanics",
  "electrical-engineering",
  "engineering-physics",
  "engineering-graphics",
  // 1st Year - Semester 1 — AIDS
  "c-programming",
  "manufacturing",
  "soft-skill",
  // "Chemistry" — lab-only companion to AIDS Sem 1's own "Engineering
  // Chemistry" (notes) and to AIML/Core Sem 2's own "Engineering
  // Chemistry" (notes, mirrored from AIDS) — see
  // add_cse_chemistry_lab_subject.sql. Bare "chemistry" slug (no
  // branch/specialization prefix) matches every other CSE-own subject
  // slug's convention (e.g. "engineering-chemistry", "c-programming");
  // uniqueness is per (specialization_id, term_id, slug), not global.
  "chemistry",
  // Biotechnology — 1st Year Semester 1 (lab-only, see below)
  "biotech-physics",
  "biotech-biotechnology",
  "biotech-mechanics",
  "biotech-graphics",
  // Biotechnology — 1st Year Semester 2 (shared + lab-only, see below)
  "biotech-c-programming",
  "biotech-biotechnology-ii",
  "biotech-manufacturing",
  "biotech-chemistry",
  "biotech-soft-skill",
  // Biotechnology — 2nd Year Semester 3 (all shared, see below)
  "biotech-analytical-techniques",
  "biotech-biochemistry",
  "biotech-cell-and-molecular-biology",
  "biotech-enzyme-engineering",
  "biotech-microbiology",
  // Civil / Mechanical / Automation & Robotics — 1st Year Semester 1
  // (mirrors AIDS's own C Programming/Digital Electronics/
  // Manufacturing — all three shared, notes+lab; see below for the
  // one lab-only entry, Soft Skill).
  "civil-c-programming",
  "civil-digital-electronics",
  "civil-manufacturing",
  "civil-soft-skill",
  "mechanical-c-programming",
  "mechanical-digital-electronics",
  "mechanical-manufacturing",
  "mechanical-soft-skill",
  "automation-robotics-c-programming",
  "automation-robotics-digital-electronics",
  "automation-robotics-manufacturing",
  "automation-robotics-soft-skill",
  // Civil / Mechanical / Automation & Robotics — 1st Year Semester 2
  // (mirrors AIML/Core's own Sem 1 shape — Engineering Mechanics/
  // Electrical Engineering/Engineering Physics shared, notes+lab;
  // Engineering Graphics lab-only, see below).
  "civil-s2-engineering-mechanics",
  "civil-s2-electrical-engineering",
  "civil-s2-engineering-physics",
  "civil-s2-engineering-graphics",
  "mechanical-s2-engineering-mechanics",
  "mechanical-s2-electrical-engineering",
  "mechanical-s2-engineering-physics",
  "mechanical-s2-engineering-graphics",
  "automation-robotics-s2-engineering-mechanics",
  "automation-robotics-s2-electrical-engineering",
  "automation-robotics-s2-engineering-physics",
  "automation-robotics-s2-engineering-graphics",
  // Civil — 2nd Year Semester 3. Every given Lab entry has its own
  // distinct name (always ending "Lab") with no exact-string match in
  // the given Notes list — e.g. "Fluid Mechanics" (notes) vs "Fluid
  // Mechanics Lab" (lab) are two different subjects, not one shared
  // one — so all 4 are lab-only (see LAB_ONLY_SUBJECT_SLUGS below).
  "civil-s3-fluid-mechanics-lab",
  "civil-s3-basic-surveying-lab",
  "civil-s3-building-material-construction-lab",
  "civil-s3-civil-engineering-drawing-lab",
  // Mechanical — 2nd Year Semester 3. Same reasoning — every lab
  // entry's name differs from every notes entry's name.
  "mechanical-s3-engineering-material-lab",
  "mechanical-s3-fluid-mechanics-lab",
  "mechanical-s3-computer-aided-machine-drawing-lab",
  "mechanical-s3-thermodynamics-lab",
  // Automation & Robotics — 2nd Year Semester 3. Same reasoning.
  "automation-robotics-s3-python-lab",
  "automation-robotics-s3-digital-electronics-lab",
  "automation-robotics-s3-engineering-materials-lab",
  "automation-robotics-s3-computer-aided-machine-drawing-lab",
]);

// The reverse case: a handful of LAB_SUBJECT_SLUGS entries are lab-ONLY —
// there's no corresponding notes/theory component for them at all, so
// they must never show up as a subject option under the Notes tab.
// Everything else with a lab component (e.g. DSA, Engineering Mechanics)
// has both notes and lab, and stays in both lists.
export const LAB_ONLY_SUBJECT_SLUGS = new Set([
  "engineering-graphics", // AIML / Core — lab only, no notes
  "soft-skill", // AIDS — lab only, no notes
  "chemistry", // AIDS Sem 1 + AIML/Core Sem 2 — lab only, no notes (see LAB_SUBJECT_SLUGS's comment)
  // Biotechnology 1st Year Sem 1's given Lab list ("Physics",
  // "Biotechnology", "Mechanics", "Graphics") shares zero names with
  // its given Notes list — all four are lab-only.
  "biotech-physics",
  "biotech-biotechnology",
  "biotech-mechanics",
  "biotech-graphics",
  // Biotechnology 1st Year Sem 2's "Chemistry" and "Soft Skill" have
  // no notes counterpart (unlike C Programming/Biotechnology II/
  // Manufacturing, which appear in both the given Notes and Lab lists
  // and so stay shared, not lab-only).
  "biotech-chemistry",
  "biotech-soft-skill",
  // Biotechnology 2nd Year Sem 3's given Lab list is a pure subset of
  // its Notes list — every lab entry there is shared, so nothing from
  // that semester belongs here.
  //
  // Civil / Mechanical / Automation & Robotics — Soft Skill, same as
  // AIDS's own, has no notes counterpart.
  "civil-soft-skill",
  "mechanical-soft-skill",
  "automation-robotics-soft-skill",
  // Civil / Mechanical / Automation & Robotics — Engineering Graphics
  // (Sem 2, mirroring AIML/Core's own Sem 1), same as AIML/Core's own,
  // has no notes counterpart.
  "civil-s2-engineering-graphics",
  "mechanical-s2-engineering-graphics",
  "automation-robotics-s2-engineering-graphics",
  // Civil / Mechanical / Automation & Robotics — 2nd Year Sem 3: every
  // given Lab subject has its own distinct name (see
  // LAB_SUBJECT_SLUGS's identical comment) — none of them are shared
  // with a notes entry, so all of them are lab-only.
  "civil-s3-fluid-mechanics-lab",
  "civil-s3-basic-surveying-lab",
  "civil-s3-building-material-construction-lab",
  "civil-s3-civil-engineering-drawing-lab",
  "mechanical-s3-engineering-material-lab",
  "mechanical-s3-fluid-mechanics-lab",
  "mechanical-s3-computer-aided-machine-drawing-lab",
  "mechanical-s3-thermodynamics-lab",
  "automation-robotics-s3-python-lab",
  "automation-robotics-s3-digital-electronics-lab",
  "automation-robotics-s3-engineering-materials-lab",
  "automation-robotics-s3-computer-aided-machine-drawing-lab",
]);

// Which subjects are valid options for a given resource type — Lab
// only ever offers subjects with a lab component; Notes/PYQ exclude
// the lab-only ones (no theory component to have notes/PYQs about).
// Shared by Notes, PYQs, CRUploadForm, and Manage's Subject filter —
// previously each reimplemented this branch inline.
export function filterSubjectsForResourceType<T extends { slug: string }>(
  subjects: T[],
  resourceType: "notes" | "lab_manual" | "pyq" | "pyq_solution" | "notice" | "update"
): T[] {
  return resourceType === "lab_manual"
    ? subjects.filter((subject) => LAB_SUBJECT_SLUGS.has(subject.slug))
    : subjects.filter((subject) => !LAB_ONLY_SUBJECT_SLUGS.has(subject.slug));
}
