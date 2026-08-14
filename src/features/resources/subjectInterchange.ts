// 1st-Year Sem 2's subject-structure interchange — a system-level
// toggle (subject_structure_config, admin-only to change) that swaps
// which branch's subject list Core/AIML/AIDS actually use for that
// one semester. Identity function everywhere else: every other term
// is completely unaffected regardless of the toggle's value.
//
// Deliberately doesn't touch which branch a RESOURCE belongs to — only
// which SUBJECT LIST is offered/matched. A Core CR's Sem 2 upload
// while interchanged is still a genuine Core resource; its subject_id
// just points at one of AIDS's subject rows instead of Core's own,
// because that's the subject list currently active for Core at that
// semester. This is what "Subjects, Labs, PYQs, any subject-linked
// resource" resolving to the active structure actually means in this
// schema — resources are already subject-linked via subject_id, so
// swapping which subject rows a branch resolves against IS swapping
// the whole subject-linked structure, without duplicating a single row
// or moving any resource between branches.
//
// Both useSubjects (client) and uploadResourceDirectAllBranches
// (server, admin bulk-publish) call this exact function so the rule
// can never drift between browsing/uploading and admin's own bulk
// path — one source of truth, not two hand-synced copies.
const INTERCHANGE_TERM_SLUG = "y1-s2";

export function resolveSubjectBranchName(
  requestedBranchName: string,
  termSlug: string | null,
  interchangeActive: boolean
): string {
  if (!interchangeActive || termSlug !== INTERCHANGE_TERM_SLUG) return requestedBranchName;
  if (requestedBranchName === "CSE AIDS") return "CSE Core";
  if (requestedBranchName === "CSE AIML" || requestedBranchName === "CSE Core") return "CSE AIDS";
  return requestedBranchName;
}
