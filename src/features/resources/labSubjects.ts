// Not every subject has a lab component — only these do (per the CR's
// syllabus). There's no column for this on `subjects` yet, so this is
// a small hardcoded list, same tradeoff as the hardcoded BRANCHES
// lists elsewhere in the app. Slugs must match supabase/seed_subjects.sql
// (2nd Year - Semester 3), supabase/seed_year1_subjects.sql (1st Year -
// Semester 1, AIML/Core), supabase/fix_year1_aids_subjects.sql
// (1st Year - Semester 1, AIDS — a different subject list from
// AIML/Core), and supabase/add_biotechnology_subjects.sql (all three
// Biotechnology semesters — see that file's own comment on which of
// its subjects are shared vs lab-only vs notes-only).
//
// These Sets are matched by slug ALONE, with no branch/term scoping —
// every Biotechnology slug below is deliberately prefixed "biotech-"
// so it can never collide with an existing (or future) slug from a
// different branch reusing a common subject name.
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
]);

// The reverse case: a handful of LAB_SUBJECT_SLUGS entries are lab-ONLY —
// there's no corresponding notes/theory component for them at all, so
// they must never show up as a subject option under the Notes tab.
// Everything else with a lab component (e.g. DSA, Engineering Mechanics)
// has both notes and lab, and stays in both lists.
export const LAB_ONLY_SUBJECT_SLUGS = new Set([
  "engineering-graphics", // AIML / Core — lab only, no notes
  "soft-skill", // AIDS — lab only, no notes
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
