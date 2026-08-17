// The one shared "has this academic period actually started yet"
// check — pure string comparison, no browser or Node-specific API, so
// it works identically from a client hook (Notes/PYQs/Upload's own
// dropdown filtering) and a server action (Upload's insert
// validation) without needing two copies of the same rule that could
// drift apart. `todayKey`/`startDate` are both yyyy-mm-dd strings
// (see src/lib/date.ts's localDateKey) — lexicographic comparison
// works correctly for that format.
export function isDateReached(startDate: string, todayKey: string): boolean {
  return startDate <= todayKey;
}

// One specific, named exception — NOT a general "chronology can be
// scoped per specialization" capability. batch_terms itself stays
// branch/specialization-agnostic everywhere else, exactly as
// deliberately designed (see supabase/add_batches.sql) — this is the
// one row/audience pairing carved out of that shared table, matching
// the same "small, explicit, hardcoded business rule" shape as
// pyqSharing.ts and subjectInterchange.ts, not a new schema
// dimension.
//
// 1st Year - Semester 2, 2025-26 batch, is hidden from CSE Core/AIML/
// AIDS — Cyber Security (and every non-CSE branch, which reaches this
// same globally-shared row the normal way) keeps it. IDs, not
// slugs/labels — every real call site already has the real id in
// hand, and hardcoding ids here (rather than a slug lookup) is what
// lets this stay a pure, dependency-free function callable from both
// a client hook and a server action.
const HIDDEN_SEM2_BATCH_ID = "2f2d1232-76ea-4a42-a744-e9be040158e3"; // 2025-26
const HIDDEN_SEM2_TERM_ID = "f9699ad2-6f0c-469e-9b28-e59ef838d889"; // 1st Year - Semester 2
const HIDDEN_SEM2_SPECIALIZATION_IDS = new Set([
  "67e55583-69ed-4a50-9aad-256fdff9fec1", // CSE Core
  "09b06a94-bcf3-41c2-9858-0ec5cb6b647a", // CSE AIML
  "f581246d-6feb-4095-aa33-e82e88a1de3f", // CSE AIDS
]);

// Second named exception: CSE Cyber Security didn't exist as a
// specialization before the 2026-27 batch (see
// supabase/expand_branch_hierarchy.sql — it was inserted brand new,
// with no 2025-26 history of its own), but batch_terms is globally
// shared, so without this it would have silently inherited the
// EXISTING 2025-26 batch's rows (Sem 1, Sem 2, even 2nd Year) the
// moment it was created — data for a cohort that, for this
// specialization, never actually existed. Every batch OTHER than
// 2026-27 is hidden for it entirely; 2026-27's own rows (already
// provisioned with their real future dates — Sem 2, then Year 2 later)
// need no exception at all and progress automatically through the
// same isDateReached logic every other specialization already uses.
const CYBER_SECURITY_SPECIALIZATION_ID = "ab74984a-a34a-4b9b-9119-79b1de0f3a98";
const CYBER_SECURITY_FIRST_BATCH_ID = "f4c959e8-e921-4e6e-b37b-f28e80cad145"; // 2026-27

/**
 * True whenever a (batch, term) pairing should be treated as if it
 * doesn't exist for the given specialization — see the two named
 * exceptions above. Every place that resolves "which semesters are
 * reachable/current" for a specific specialization (the Notes/PYQ/
 * Notices picker, upload/edit's server-side chronology check, and —
 * in SQL, via the mirrored check inside cr_current_term_id — CR
 * permissions themselves) filters matching rows out before running its
 * normal isDateReached logic, not merely hiding them from a dropdown.
 */
export function isBatchTermHiddenForSpecialization(
  batchId: string,
  termId: string,
  specializationId: string | null
): boolean {
  if (!specializationId) return false;
  if (batchId === HIDDEN_SEM2_BATCH_ID && termId === HIDDEN_SEM2_TERM_ID && HIDDEN_SEM2_SPECIALIZATION_IDS.has(specializationId)) {
    return true;
  }
  if (specializationId === CYBER_SECURITY_SPECIALIZATION_ID && batchId !== CYBER_SECURITY_FIRST_BATCH_ID) {
    return true;
  }
  return false;
}
