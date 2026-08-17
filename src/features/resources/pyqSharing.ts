import type { Specialization } from "@/features/branches/types";

// PYQ visibility grouping — which (branch, specialization) pairs
// actually belong together. Only CSE has a sharing question at all: a
// branch with no specialization concept has nothing to pool with, so
// its PYQ pool is always just itself. Within CSE: 1st Year, Core and
// AIML share a syllabus, so their PYQs are interchangeable; AIDS's
// 1st-year syllabus is genuinely different (see
// fix_year1_aids_subjects.sql), so AIDS gets its own separate pool.
// 2nd Year: Core/AIML/AIDS share one syllabus, so PYQs stay shared
// across all three — the original cross-branch (really
// cross-specialization) design. Cyber Security, the newest CSE
// specialization, is confirmed independent of all of this — it never
// joins a pool with the other three, any year.
//
// Single source of truth, not per-page hardcoding — usePyqResources
// and the upload duplicate-check both resolve through this, so the
// rule can't drift between "what a student browses" and "what counts
// as a duplicate at upload time". Deliberately enforced in the QUERY
// layer, not RLS: students never log in, so there's no session RLS
// could scope by — same reason Notes & Lab's own branch scoping is
// already a query-level .eq("branch_id", ...), not an RLS predicate
// tied to auth.uid(). RLS's job here stays "is this approved, and same
// real branch for a CR write" (see supabase/scope_pyq_by_branch.sql);
// which SPECIALIZATIONS within that branch a browser pools together is
// this app-level query concern.
//
// Driven by the specializations actually fetched for the branch (not
// a hardcoded name list) — a branch with zero specializations (every
// non-CSE branch today) returns just its own single-entry pool with no
// special-casing needed.
const CORE_AIML_SLUGS = new Set(["cse-core", "cse-aiml"]);
const AIDS_SLUG = "cse-aids";

/**
 * Which pool the VIEWER's own specialization (viewerSpecializationSlug
 * — analogous to the old pyqSharingBranchNames' own branchName param)
 * belongs to, not just "whichever known pool exists in this branch" —
 * a Cyber Security viewer must never be handed Core/AIML's pool just
 * because Core and AIML happen to exist in the same branch's
 * specialization list.
 */
export function pyqSharingSpecializationIds(
  yearNumber: number,
  viewerSpecializationSlug: string,
  specializations: Pick<Specialization, "id" | "slug">[]
): string[] {
  if (specializations.length === 0) return [];

  const ownOnly = () => {
    const own = specializations.find((s) => s.slug === viewerSpecializationSlug);
    return own ? [own.id] : [];
  };

  if (yearNumber === 1) {
    if (!CORE_AIML_SLUGS.has(viewerSpecializationSlug)) return ownOnly();
    return specializations.filter((s) => CORE_AIML_SLUGS.has(s.slug)).map((s) => s.id);
  }

  // 2nd Year+ today; any future year defaults to the fully-shared rule
  // among Core/AIML/AIDS too, rather than silently splitting one off
  // with no stated reason to — Cyber Security stays excluded always.
  if (!CORE_AIML_SLUGS.has(viewerSpecializationSlug) && viewerSpecializationSlug !== AIDS_SLUG) return ownOnly();
  return specializations
    .filter((s) => CORE_AIML_SLUGS.has(s.slug) || s.slug === AIDS_SLUG)
    .map((s) => s.id);
}
