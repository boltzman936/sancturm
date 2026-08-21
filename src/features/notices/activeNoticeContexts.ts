// Plain shared constant — no "use client", safe to import from both
// client hooks (currentSemester.ts) and server actions (actions.ts),
// so the two can't drift apart on which Year maps to which Semester.
//
// Notices are NOT a general date-based system like Notes/PYQ — there
// are only ever exactly the semesters that are actually, currently
// running, and which ones those are is a fact a human knows, not
// something worth computing from batch_terms date ranges. Same
// "small, explicit, hardcoded business rule" shape the rest of this
// codebase already uses (see pyqSharing.ts's Core/AIML pool,
// historicalSharing.ts's 2025-26/Year-1 carve-out).
//
// Right now, exactly two Notice contexts exist:
//   - 2026-27 batch, 1st Year -> Semester 1
//   - 2025-26 batch, 2nd Year -> Semester 3
// Update this map (and nothing else) the moment a new semester
// actually starts.
export const YEAR_TO_CURRENT_SEMESTER_NUMBER: Record<number, number> = {
  1: 1,
  2: 3,
};
