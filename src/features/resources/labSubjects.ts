// Not every subject has a lab component — only these do (per the CR's
// syllabus). There's no column for this on `subjects` yet, so this is
// a small hardcoded list, same tradeoff as the hardcoded BRANCHES
// lists elsewhere in the app. Slugs must match supabase/seed_subjects.sql
// (2nd Year - Semester 3) and supabase/seed_year1_subjects.sql (1st
// Year - Semester 1).
export const LAB_SUBJECT_SLUGS = new Set([
  // 2nd Year - Semester 3
  "dsa",
  "digital-electronics",
  "python",
  // 1st Year - Semester 1
  "engineering-mechanics",
  "electrical-engineering",
  "engineering-physics",
  "engineering-graphics",
]);
