// Not every subject has a lab component — only these do (per the CR's
// syllabus). There's no column for this on `subjects` yet, so this is
// a small hardcoded list, same tradeoff as the hardcoded BRANCHES
// lists elsewhere in the app. Slugs must match supabase/seed_subjects.sql.
export const LAB_SUBJECT_SLUGS = new Set(["dsa", "digital-electronics", "python"]);
