// 1st-Year Sem 2's subject structure for CSE Core/AIML/AIDS is always
// the SWAPPED Sem 1 curriculum — Core/AIML see AIDS's Sem 1 subjects,
// AIDS sees Core/AIML's Sem 1 subjects. Unconditional, not an
// admin-togglable option: per the "FINAL CSE SEMESTER + INTERCHANGE
// SYSTEM" spec, "the subjects that are currently shown for the
// respective branches in Sem 1 will be mapped/interchanged according
// to the existing CSE interchange rules when Sem 2 is selected" — that
// IS what Sem 2 means for these three specializations, not a state a
// toggle turns on and off. (subject_structure_config.interchange_active
// still exists — see SubjectInterchangeControl.tsx — but now only
// gates the separate, one-time 2026-27 Sem 2 activation, not this
// mapping.) Identity function everywhere else: every other term, and
// every other specialization (Cyber Security — confirmed independent —
// and anything outside CSE, which has no specialization concept at
// all) is completely unaffected.
//
// Deliberately doesn't touch which specialization a RESOURCE belongs
// to — only which SUBJECT LIST is offered/matched. A Core CR's Sem 2
// upload is still a genuine Core resource; its subject_id just points
// at one of AIDS's subject rows instead of Core's own, because that's
// the subject list active for Core at that semester. This is what
// "Subjects, Labs, PYQs, any subject-linked resource" resolving to the
// active structure actually means in this schema — resources are
// already subject-linked via subject_id, so swapping which subject
// rows a specialization resolves against IS swapping the whole
// subject-linked structure, without duplicating a single row or moving
// any resource between branches.
//
// Operates on specialization NAMES (unchanged from before the
// branch-expansion migration — specializations kept their exact
// pre-migration names, "CSE Core"/"CSE AIML"/"CSE AIDS", just moved
// from the `branches` table to `specializations`), resolved against
// that table now instead of `branches`.
//
// Both useSubjects (client) and uploadResourceDirectAllBranches
// (server, admin bulk-publish) call this exact function so the rule
// can never drift between browsing/uploading and admin's own bulk
// path — one source of truth, not two hand-synced copies.
const INTERCHANGE_TERM_SLUG = "y1-s2";

export function resolveSubjectSpecializationName(requestedSpecializationName: string, termSlug: string | null): string {
  if (termSlug !== INTERCHANGE_TERM_SLUG) return requestedSpecializationName;
  if (requestedSpecializationName === "CSE AIDS") return "CSE Core";
  if (requestedSpecializationName === "CSE AIML" || requestedSpecializationName === "CSE Core") return "CSE AIDS";
  return requestedSpecializationName;
}

// CSE Core/AIML/AIDS's 1st Year Sem 2 has no subject rows of its own —
// deliberately: per the "FINAL CSE SEMESTER + INTERCHANGE SYSTEM"
// correction, Sem 2's entire subject list is always a live, read-time
// redirect to Sem 1's real subject rows (with resolveSubjectSpecializ
// ationName above still deciding WHICH specialization's Sem 1 list
// applies). This is the "which TERM to query subjects against" half of
// that same redirect; the two functions are always used together.
//
// Named exception, matching this file's existing scope: only Core/
// AIML/AIDS redirect. Cyber Security is a distinct specialization
// (independent of this interchange system entirely, per its own
// batch/chronology carve-out in academicChronology.ts) and every
// non-CSE branch passes specializationName = null, so both fall
// through unchanged here.
//
// Deliberately does NOT affect resource queries — a Sem 2 upload is a
// genuine Sem 2 resource (its own term_id stays real/unredirected);
// only its subject_id may legitimately point at a Sem 1-term subject
// row, because that's the only subject list that ever existed. Callers
// resolving a subject to attach to a Sem 2 resource use this function;
// callers querying/inserting the resource itself never do.
const CORE_AIML_AIDS_SPECIALIZATION_NAMES = new Set(["CSE Core", "CSE AIML", "CSE AIDS"]);

export function resolveSubjectQueryTermSlug(
  specializationName: string | null,
  termSlug: string | null
): string | null {
  if (termSlug !== INTERCHANGE_TERM_SLUG) return termSlug;
  if (!specializationName || !CORE_AIML_AIDS_SPECIALIZATION_NAMES.has(specializationName)) return termSlug;
  return "y1-s1";
}
