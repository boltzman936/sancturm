// PYQ visibility grouping — which branches' question papers actually
// belong together. 1st Year: CSE Core and AIML share a syllabus, so
// their PYQs are interchangeable; AIDS's 1st-year syllabus is
// genuinely different (see fix_year1_aids_subjects.sql), so AIDS gets
// its own separate PYQ pool, never mixed with Core/AIML's. 2nd Year:
// all three branches share one syllabus, so PYQs stay shared across
// all of them — the original cross-branch design.
//
// Single source of truth, not per-page hardcoding — usePyqResources
// and the upload duplicate-check both resolve through this, so the
// rule can't drift between "what a student browses" and "what counts
// as a duplicate at upload time". Deliberately enforced in the QUERY
// layer, not RLS: students never log in, so there's no session RLS
// could scope by — same reason Notes & Lab's own branch scoping is
// already a query-level .eq("branch_id", ...), not an RLS predicate
// tied to auth.uid(). RLS's job here stays "is this approved" (already
// true for any public read); which branch(es) a browser sees is an
// app-level query concern, exactly like it already was for notes_lab.
export function pyqSharingBranchNames(yearNumber: number, branchName: string): string[] {
  if (yearNumber === 1) {
    return branchName === "CSE AIDS" ? ["CSE AIDS"] : ["CSE AIML", "CSE Core"];
  }
  // 2nd Year today; any future year defaults to the fully-shared rule
  // too, rather than silently splitting a branch off with no stated
  // reason to.
  return ["CSE AIML", "CSE Core", "CSE AIDS"];
}
