// Read-time content sharing between branches whose 1st-Year curriculum
// intentionally MIRRORS CSE's own (see supabase/
// add_civil_mechanical_automation_*.sql) — Civil/Mechanical/Automation
// & Robotics have no separate Notes/Lab/PYQ content of their own for
// these terms; browsing them should surface the existing resources
// already uploaded under the matching CSE source scope. Never
// duplicates a row: the resource stays exactly where it was uploaded
// (CSE's own branch/specialization/term); this only widens which
// scopes a resource query searches, same idea as CSE Core/AIML/AIDS's
// own Sem 2 -> Sem 1 redirect (see subjectInterchange.ts +
// queries.ts's useEffectiveScope) — that one is a single-scope,
// same-physical-subject-row redirect; this one is a cross-BRANCH,
// name-matched union, since Civil/Mechanical/Automation & Robotics
// have their own distinct subject rows (different ids, same names)
// rather than sharing CSE's rows directly.
import { resolveSubjectQueryTermSlug, resolveSubjectSpecializationName } from "./subjectInterchange";

export type SharedResourceScope = { branchSlug: string; specializationName: string | null; termSlug: string };

// The one subject renamed between CSE's source curriculum and the
// mirroring branches — every other subject in the mirrored set kept an
// identical name (see the migration's own subject lists), so this is
// the only alias name-matching needs.
const SUBJECT_NAME_ALIASES: Record<string, string> = {
  "Engineering Mathematics I": "Mathematics I",
  "Engineering Mathematics II": "Mathematics I",
};

export function normalizeSharedSubjectName(name: string): string {
  return SUBJECT_NAME_ALIASES[name] ?? name;
}

const MIRRORING_BRANCH_SLUGS = new Set(["civil", "mechanical", "automation-robotics"]);

/**
 * Civil/Mechanical/Automation & Robotics's 1st Year curriculum mirrors
 * CSE's own Sem 1 curriculum — their own Sem 1 mirrors CSE AIDS's Sem
 * 1, and their own Sem 2 mirrors CSE Core/AIML's Sem 1 (both pooled —
 * Core and AIML share an identical Sem 1 subject list, the same
 * grouping subjectInterchange.ts's own swap treats as one unit). 2nd
 * Year Sem 3 is a real, distinct curriculum given directly per branch
 * (see add_civil_mechanical_automation_sem3.sql) — no sharing there,
 * so it returns empty.
 */
export function getMirroringResourceScopes(branchSlug: string, termSlug: string | null): SharedResourceScope[] {
  if (!termSlug || !MIRRORING_BRANCH_SLUGS.has(branchSlug)) return [];
  if (termSlug === "y1-s1") return [{ branchSlug: "cse", specializationName: "CSE AIDS", termSlug: "y1-s1" }];
  if (termSlug === "y1-s2") {
    return [
      { branchSlug: "cse", specializationName: "CSE Core", termSlug: "y1-s1" },
      { branchSlug: "cse", specializationName: "CSE AIML", termSlug: "y1-s1" },
    ];
  }
  return [];
}

/**
 * One entry point covering both content-sharing rules this file knows
 * about: CSE Core/AIML/AIDS's own Sem 2 self-swap (their Sem 2 IS the
 * swapped specialization's real Sem 1 — see subjectInterchange.ts) and
 * Civil/Mechanical/Automation & Robotics's cross-branch mirroring
 * above. Resource-query callers (see queries.ts's
 * useSharedResourceSourceScopes) only ever need to call this one
 * function regardless of which rule actually applies to the viewer's
 * current (branch, specialization, term) — empty for every case
 * neither rule covers.
 */
export function getSharedResourceScopes(
  branchSlug: string,
  specializationName: string | null,
  termSlug: string | null
): SharedResourceScope[] {
  if (!termSlug) return [];
  if (branchSlug === "cse" && specializationName) {
    const swappedName = resolveSubjectSpecializationName(specializationName, termSlug);
    const swappedTermSlug = resolveSubjectQueryTermSlug(specializationName, termSlug) ?? termSlug;
    if (swappedName === specializationName && swappedTermSlug === termSlug) return [];
    return [{ branchSlug: "cse", specializationName: swappedName, termSlug: swappedTermSlug }];
  }
  return getMirroringResourceScopes(branchSlug, termSlug);
}
