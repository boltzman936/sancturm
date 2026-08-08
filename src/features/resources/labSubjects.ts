// Not every subject has a lab component — only these do (per the CR's
// syllabus). There's no column for this on `subjects` yet, so this is
// a small hardcoded list, same tradeoff as the hardcoded BRANCHES
// lists elsewhere in the app. Slugs must match supabase/seed_subjects.sql
// (2nd Year - Semester 3), supabase/seed_year1_subjects.sql (1st Year -
// Semester 1, AIML/Core), and supabase/fix_year1_aids_subjects.sql
// (1st Year - Semester 1, AIDS — a different subject list from
// AIML/Core).
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
]);

// The reverse case: a handful of LAB_SUBJECT_SLUGS entries are lab-ONLY —
// there's no corresponding notes/theory component for them at all, so
// they must never show up as a subject option under the Notes tab.
// Everything else with a lab component (e.g. DSA, Engineering Mechanics)
// has both notes and lab, and stays in both lists.
export const LAB_ONLY_SUBJECT_SLUGS = new Set([
  "engineering-graphics", // AIML / Core — lab only, no notes
  "soft-skill", // AIDS — lab only, no notes
]);
