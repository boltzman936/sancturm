"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useBatches, useBatchTerms, useAllBatchTerms } from "@/features/batches/queries";
import { useTerms, useTermBySlug } from "@/features/terms/queries";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBranchBySlug, useSpecializationBySlug } from "@/features/branches/queries";
import { useBatch } from "@/hooks/useBatch";
import { useTerm } from "@/hooks/useTerm";
import { useResetInvalidSelection } from "./useResetInvalidSelection";
import { useSessionPersistedState } from "./useSessionPersistedState";
import { localDateKey } from "@/lib/date";
import { isDateReached, isBatchTermHiddenForSpecialization } from "@/features/batches/academicChronology";
import type { BatchTerm, AcademicTerm } from "@/types/database";

// sessionStorage (not localStorage — see below) key holding the
// year_number an explicit Batch pick was made for. Plain localStorage
// can't tell "the student deliberately chose an older batch a minute
// ago" apart from "this is a leftover pick from a visit eight months
// back, before that batch ever left this Year" — both look identical,
// just a persisted label. sessionStorage naturally clears on a new
// browser session (new tab tomorrow), which is exactly the boundary
// that matters: within one sitting, an explicit pick sticks across
// refreshes and Notes<->PYQs navigation; across sittings, the default
// always gets recomputed against today's real academic calendar.
const BATCH_EXPLICIT_PICK_YEAR_KEY = "sancturm:batchExplicitYear";

// The other half of that same mechanism: which Year this hook most
// recently resolved a Batch default for, in THIS browser session.
// Needed because an explicit pick's year alone isn't enough to tell
// "still on the same Year visit" apart from "left this Year and came
// back to it later in the same session" — a 1st Year -> 2nd Year ->
// 1st Year round trip must land back on 1st Year's own current
// default, not resurrect whatever batch 2nd Year happened to also
// default to just because BATCH_EXPLICIT_PICK_YEAR_KEY still said "1"
// from before the round trip.
const LAST_YEAR_KEY = "sancturm:batchDefaultLastYear";

// sessionStorage key for the explicitly-picked Semester itself (not
// just a flag like the two above — the actual term_id, or "" for "no
// explicit pick, defer to current"). Session-scoped for the same
// reason Batch's pick is: a leftover pick from a visit eight months
// ago shouldn't outlive its own academic relevance forever, but within
// one sitting it must survive a plain route change (Notes -> CR
// Dashboard -> Notes) — see useSessionPersistedState's own comment for
// why a route change alone was silently dropping this before (termId
// used to be a bare useState, which resets to null on every remount).
const SEMESTER_PICK_KEY = "sancturm:semesterPick";

export const ALL_BATCHES = "all";
// A pseudo-Semester meaning "every semester currently in view" —
// only ever a valid pick when Batch is ALSO "All batches" (see
// validTermIds below): blending multiple batches' semesters together
// is the one case where showing them all at once, instead of forcing
// a single pick, actually makes sense. Picking a specific batch always
// clears back out of this, same as any other now-invalid Semester.
export const ALL_SEMESTERS = "all";

type ReachedTerm = BatchTerm & { term: AcademicTerm };

/**
 * The one centralized academic-default resolver: given a year and the
 * full (batch, term) chronology, finds whichever batch is currently
 * AT that year — the one with a reached (start_date <= today) row for
 * this year_number that's still running (today <= end_date), or if
 * none is exactly active right now, whichever reached that year most
 * recently. Every place that needs "the current batch for year N"
 * calls this same function so the rule can't drift or get
 * reimplemented differently per page.
 */
function resolveDefaultBatchIdForYear(
  yearNumber: number,
  everyBatchTerms: ReachedTerm[],
  todayKey: string
): string | null {
  const forYear = everyBatchTerms.filter(
    (bt) => bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey)
  );
  if (forYear.length === 0) return null;
  const current = forYear.find((bt) => todayKey <= bt.end_date);
  const chosen = current ?? forYear.reduce((latest, bt) => (bt.start_date > latest.start_date ? bt : latest));
  return chosen.batch_id;
}

/**
 * Batch+Semester scoping for student browsing (Notes/Lab/PYQ).
 *
 * Year permanently owns a fixed semester range (1st Year is Semester
 * 1-2, 2nd Year is 3-4, and so on — see reachedTerms' own comment for
 * why that's config-driven rather than hardcoded here). Semester
 * options for a specific Batch are that range intersected with
 * whichever of those periods the batch has actually reached by date —
 * NEVER a period from a different Year, no matter how far the batch
 * has actually progressed. Switching Year for the same Batch shows a
 * genuinely different set of options, not a superset or a batch's
 * full history. The sidebar Year also drives which Batch to land on
 * by default (resolveDefaultBatchIdForYear) and which Batches are
 * even offered as choices (eligibleBatches) — both already
 * year-scoped in the same way.
 *
 * "All batches" unions those same per-year rows across every batch,
 * deduped by term_id (preferring whichever batch's row is actually
 * live, for accurate dates) — so it can show MULTIPLE options when
 * different batches are at different points within the same Year
 * (e.g. Year 1: a brand-new batch's live Semester 1 AND an older
 * batch's already-finished Semester 2, side by side). Because
 * blending distinct batches like that makes "current" ambiguous
 * (whose current?), "All batches" never badges anything "(current)" —
 * only a specific single batch does. "All batches" itself is only
 * offered when 2+ eligible batches exist for this Year — a single
 * eligible batch makes it redundant, so the persisted selection
 * auto-collapses to that one batch instead.
 *
 * Batch and Semester DEFAULTS are computed dynamically from the real
 * academic calendar (batch_terms dates) — never hardcoded, never
 * derived from which batch happens to have uploads. An explicit Batch
 * pick is respected across re-renders, page refreshes, and Notes<->PYQ
 * navigation for the rest of the browser session (see
 * BATCH_EXPLICIT_PICK_YEAR_KEY) — but a batch pick from an OLDER
 * session, or a genuine sidebar Year switch, always resolves back to
 * that Year's real current default. A batch simply having reached this
 * Year at some point in its history isn't enough to keep it pinned as
 * the default forever — otherwise a returning student's device stays
 * stuck on whichever batch was current the last time they explicitly
 * touched the picker, long after that batch has moved on.
 *
 * A single shared hook so Notes and PYQs can't drift out of sync on
 * this logic the way they already did once this session.
 */
export function useBatchSemesterFilter() {
  const { term: sidebarSlug } = useTerm();
  const { data: sidebarTerm } = useTermBySlug(sidebarSlug);
  const yearNumber = sidebarTerm?.year_number;

  const { data: allBatches } = useBatches(); // config-driven, newest first, never filtered
  const { batch: batchLabel, setBatch: persistBatch } = useBatch();
  const batchFilter = useMemo(() => {
    if (!batchLabel || batchLabel === ALL_BATCHES) return ALL_BATCHES;
    return allBatches?.find((b) => b.label === batchLabel)?.id ?? ALL_BATCHES;
  }, [batchLabel, allBatches]);

  const { data: oneBatchTermsRaw } = useBatchTerms(batchFilter !== ALL_BATCHES ? batchFilter : null);
  const { data: everyBatchTermsRaw } = useAllBatchTerms();

  // Resolved purely to apply isBatchTermHiddenForSpecialization below —
  // this hook otherwise has no branch/specialization concept at all,
  // it only ever reads the sidebar's Year. Filtering here (rather than
  // touching the reduction logic itself) means every rule below —
  // reachedTerms, eligibleBatches, the default-batch resolver — just
  // sees a batch_terms list that's already missing the one hidden row
  // for these three specializations, with zero changes to how any of
  // them work.
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);
  const { specialization: specializationSlug } = useSpecialization();
  const { data: specialization } = useSpecializationBySlug(
    branch?.has_specializations ? (branch?.id ?? null) : null,
    specializationSlug
  );
  const specializationId = branch?.has_specializations ? (specialization?.id ?? null) : null;

  const oneBatchTerms = useMemo(
    () => oneBatchTermsRaw?.filter((bt) => !isBatchTermHiddenForSpecialization(bt.batch_id, bt.term_id, specializationId)),
    [oneBatchTermsRaw, specializationId]
  );
  const everyBatchTerms = useMemo(
    () => everyBatchTermsRaw?.filter((bt) => !isBatchTermHiddenForSpecialization(bt.batch_id, bt.term_id, specializationId)),
    [everyBatchTermsRaw, specializationId]
  );

  const todayKey = localDateKey(new Date().toISOString());

  // Year permanently owns a fixed semester range — 1st Year is Sem
  // 1-2, 2nd Year is Sem 3-4, and so on, encoded by each term's own
  // year_number column (config-driven: a future "3rd Year" just needs
  // its academic_terms rows inserted with year_number=3, no code
  // change). "1st Year + Semester 3" must never be reachable, no
  // matter how far a batch has actually progressed — so BOTH the
  // specific-batch and "All batches" cases filter to year_number ===
  // yearNumber first, and only THEN ask which of those periods the
  // batch(es) have actually reached by date. Reached-but-wrong-Year
  // periods (e.g. 2025-26 already being in Semester 3) simply don't
  // exist in this list while viewing "1st Year" — they show up under
  // "2nd Year" instead, once that's the selected Year.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    if (yearNumber === undefined) return [];
    if (batchFilter !== ALL_BATCHES) {
      return (oneBatchTerms ?? [])
        .filter((bt) => bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey))
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
    }
    const reached = (everyBatchTerms ?? []).filter(
      (bt) => bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey)
    );
    // Union across every batch (within this year),
    // deduped by term_id — if ANY batch has reached a period, it's a
    // valid option here. A term_id can be shared by two batches at
    // different points in their own progression — prefer whichever
    // batch's row is actually CURRENT for the "(current)" check
    // below, not just whichever sorts first.
    const byTerm = new Map<string, ReachedTerm>();
    for (const bt of reached) {
      const existing = byTerm.get(bt.term_id);
      if (!existing) {
        byTerm.set(bt.term_id, bt);
        continue;
      }
      const existingCurrent = existing.start_date <= todayKey && todayKey <= existing.end_date;
      const candidateCurrent = bt.start_date <= todayKey && todayKey <= bt.end_date;
      if (candidateCurrent && !existingCurrent) byTerm.set(bt.term_id, bt);
    }
    return Array.from(byTerm.values()).sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [yearNumber, batchFilter, oneBatchTerms, everyBatchTerms, todayKey]);

  const isLoadingReachedTerms =
    yearNumber === undefined ||
    (batchFilter === ALL_BATCHES ? everyBatchTerms === undefined : oneBatchTerms === undefined);

  // Genuinely mid-period right now (start_date <= today <= end_date) —
  // "" when nothing in view is actually active, e.g. both of this
  // batch's semesters within the selected Year have already finished.
  // This — not currentTermId below — is what the "(current)" badge
  // should be keyed on; conflating the two would badge a semester
  // that's merely the most-recently-finished one.
  //
  // Never badges anything under "All batches": that view can blend
  // rows from genuinely different batches (e.g. one batch's live
  // Semester 1 next to another's already-finished Semester 2), so
  // "current" would only ever be true for one specific batch's own
  // row — badging it there would misleadingly imply that's true for
  // the merged view as a whole. Only a single, unambiguous batch
  // selection ever gets the badge.
  const liveCurrentTermId = useMemo(() => {
    if (batchFilter === ALL_BATCHES) return "";
    const live = reachedTerms.find((bt) => bt.start_date <= todayKey && todayKey <= bt.end_date);
    return live?.term_id ?? "";
  }, [reachedTerms, todayKey, batchFilter]);

  // null = defer to whichever period is calendar-current, or — if
  // nothing in view is actually active — the most recently reached
  // one. Purely a default-selection fallback, not a "this is live"
  // claim; see liveCurrentTermId for that. Persisted for the session
  // (see SEMESTER_PICK_KEY) so an explicit pick survives a route
  // change instead of silently reverting to "current" the moment the
  // page remounts — "" is this hook's own cleared/initial sentinel
  // (useSessionPersistedState requires a string), mapped to/from null
  // right here so every other use of termId in this file keeps its
  // existing string | null meaning unchanged.
  const [rawTermId, setRawTermId] = useSessionPersistedState<string>(SEMESTER_PICK_KEY, "");
  const termId = rawTermId === "" ? null : rawTermId;
  // Memoized — this goes straight into useResetInvalidSelection's own
  // dependency array below; an unmemoized wrapper here would get a new
  // identity every render and make that effect re-run on every render
  // regardless of whether the selection actually changed.
  const setTermIdState = useCallback((id: string | null) => setRawTermId(id ?? ""), [setRawTermId]);
  const currentTermId = useMemo(() => {
    if (reachedTerms.length === 0) return "";
    return liveCurrentTermId || reachedTerms[reachedTerms.length - 1].term_id;
  }, [reachedTerms, liveCurrentTermId]);
  const effectiveTermId = termId ?? currentTermId;

  // Batch or Year changed underneath an explicit Semester pick that's
  // no longer reached — defer back to whatever's current instead of
  // silently querying a stale/invalid pairing. ALL_SEMESTERS is only
  // ever a valid pick under "All batches" — picking a specific batch
  // while it's selected gets caught here exactly like a stale term id
  // would, resetting back to null (defer to current).
  const validTermIds = useMemo(
    () =>
      isLoadingReachedTerms
        ? undefined
        : [null, ...reachedTerms.map((bt) => bt.term_id), ...(batchFilter === ALL_BATCHES ? [ALL_SEMESTERS] : [])],
    [isLoadingReachedTerms, reachedTerms, batchFilter]
  );
  useResetInvalidSelection(termId, validTermIds, null, setTermIdState);

  const { data: allTerms } = useTerms();
  const effectiveTerm = allTerms?.find((t) => t.id === effectiveTermId);

  // Date-conscious, not tied to a specific Year: a Semester picker is
  // only worth showing once there's actually more than one reached
  // period, WITHIN this Year's own range, to pick between. Today that
  // means both Years hide it — 1st Year's 2026-27 has reached only
  // Semester 1 so far, and 2nd Year's 2025-26 has reached only
  // Semester 3 of its own Semester 3-4 range (Semester 4 hasn't
  // started). This is a live COUNT off reachedTerms (already
  // Year-scoped — see its own comment), not a hardcoded per-Year rule:
  // the moment 2025-26 reaches its own Semester 4 (per batch_terms'
  // configured start date, no code change needed), reachedTerms.length
  // for 2nd Year becomes 2 and the picker appears on its own. Every
  // page that would otherwise render a Semester <select> checks this
  // one flag instead of re-deriving the rule itself.
  const hideSemesterFilter = reachedTerms.length <= 1;

  // The list of term ids the resource query should actually fetch —
  // normally just the one effective term; widens to "every semester
  // currently in view" (reachedTerms itself) only when the user
  // explicitly picked "All semesters" under "All batches". When the
  // Semester picker is hidden (hideSemesterFilter) there's nothing to
  // widen: reachedTerms has at most one entry, and effectiveTermId
  // already resolves to it on its own (see currentTermId above) — no
  // special-casing needed here for that.
  const effectiveTermIds = useMemo(
    () => (effectiveTermId === ALL_SEMESTERS ? reachedTerms.map((bt) => bt.term_id) : effectiveTermId ? [effectiveTermId] : []),
    [effectiveTermId, reachedTerms]
  );

  // Which batches are actually offerable for the Batch dropdown at
  // this sidebar Year — only ones with a reached row for this EXACT
  // year_number (a batch that hasn't reached this year at all, like a
  // brand-new batch under a later Year tab, isn't a real choice here).
  // Notes/PYQs render this instead of the full allBatches catalog for
  // the Batch <select>'s options.
  const eligibleBatches = useMemo(() => {
    if (yearNumber === undefined || !everyBatchTerms || !allBatches) return undefined;
    return allBatches.filter((b) =>
      everyBatchTerms.some(
        (bt) => bt.batch_id === b.id && bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey)
      )
    );
  }, [yearNumber, everyBatchTerms, allBatches, todayKey]);

  // Batch DEFAULT recomputation — fires only when actually needed:
  // first-ever visit (batchLabel never persisted), a persisted batch
  // that wasn't explicitly picked THIS session for this exact Year
  // (see BATCH_EXPLICIT_PICK_YEAR_KEY's own comment — this is what
  // stops a months-old leftover pick from sticking forever just
  // because that batch technically reached this Year at some point),
  // or "All batches" is persisted but only one batch is eligible for
  // this year (offering "All batches" next to a single real option is
  // redundant, and the Batch <select> won't even render it — see
  // eligibleBatches — so the persisted choice needs to point at
  // something that's actually rendered).
  useEffect(() => {
    if (yearNumber === undefined || !everyBatchTerms || !allBatches || !eligibleBatches) return;

    // A genuine Year switch (including a round trip back to a Year
    // visited earlier this same session) always forces a fresh default
    // resolution, regardless of what the explicit-pick flag says — see
    // LAST_YEAR_KEY's own comment.
    const yearSwitched = window.sessionStorage.getItem(LAST_YEAR_KEY) !== String(yearNumber);
    window.sessionStorage.setItem(LAST_YEAR_KEY, String(yearNumber));

    if (batchLabel === ALL_BATCHES) {
      if (eligibleBatches.length === 1) persistBatch(eligibleBatches[0].label);
      return;
    }

    const explicitlyPickedThisYear =
      !yearSwitched && window.sessionStorage.getItem(BATCH_EXPLICIT_PICK_YEAR_KEY) === String(yearNumber);
    const pickedBatch = batchLabel ? allBatches.find((b) => b.label === batchLabel) : undefined;
    const currentlyValid =
      explicitlyPickedThisYear && !!pickedBatch && eligibleBatches.some((b) => b.id === pickedBatch.id);
    if (currentlyValid) return;

    // Only writes to the external localStorage-backed store here, not
    // local React state — the batch switch this triggers changes
    // `reachedTerms` (year+batch scoped), which is exactly what the
    // useResetInvalidSelection call above already watches: an old
    // explicit Semester pick that no longer belongs to the new scope
    // gets caught and cleared there, not duplicated in this effect.
    const defaultBatchId = resolveDefaultBatchIdForYear(yearNumber, everyBatchTerms, todayKey);
    const defaultBatch = defaultBatchId ? allBatches.find((b) => b.id === defaultBatchId) : undefined;
    persistBatch(defaultBatch ? defaultBatch.label : ALL_BATCHES);
  }, [yearNumber, everyBatchTerms, allBatches, eligibleBatches, batchLabel, todayKey, persistBatch]);

  function setBatchFilter(id: string) {
    if (id === ALL_BATCHES) {
      persistBatch(ALL_BATCHES);
    } else {
      const picked = allBatches?.find((b) => b.id === id);
      if (picked) persistBatch(picked.label);
    }
    // Marks this an explicit, in-session choice for the sessionStorage
    // check above — see BATCH_EXPLICIT_PICK_YEAR_KEY's comment.
    if (yearNumber !== undefined) window.sessionStorage.setItem(BATCH_EXPLICIT_PICK_YEAR_KEY, String(yearNumber));
    setTermIdState(null); // defer to the new batch's current period
  }

  function setTermId(id: string) {
    setTermIdState(id);
  }

  // Loaded, but genuinely zero batches have reached this Year for this
  // (branch, specialization) — was always theoretically possible (a
  // brand-new batch under a later Year tab) but never actually
  // reachable in practice until a specialization could be excluded
  // from a whole batch (see isBatchTermHiddenForSpecialization — e.g.
  // Cyber Security has no 2025-26 cohort at all, so "2nd Year" is
  // simply unreached for it today). Every caller checks this BEFORE
  // rendering batchSelect()/semesterSelect() — an empty eligibleBatches
  // renders a real <select> with zero <option>s, which shows as a
  // blank, broken-looking dropdown rather than communicating "nothing
  // here yet, for a real reason."
  const hasNoReachedBatches = eligibleBatches !== undefined && eligibleBatches.length === 0;

  return {
    yearNumber,
    allBatches,
    eligibleBatches,
    hasNoReachedBatches,
    batchFilter,
    setBatchFilter,
    reachedTerms,
    isLoadingReachedTerms,
    hideSemesterFilter,
    liveCurrentTermId,
    effectiveTermId,
    effectiveTermIds,
    effectiveTerm,
    currentTermId,
    setTermId,
  };
}

/**
 * "Which term is live for Year N, right now" — batch-independent, no
 * Batch picker involved at all. Built for Notices (see
 * notices/page.tsx and useLatestNotice's sidebar badge): a notice is
 * scoped to Branch + Specialization + Year + whichever semester is
 * genuinely current, with no Batch dimension exposed anywhere in that
 * flow. Reuses the same useAllBatchTerms() data this file's own
 * liveCurrentTermId is built on (already cached, no extra request —
 * see this file's own top-level useAllBatchTerms call for that data's
 * source).
 *
 * Does NOT assume exactly one batch is ever live for a Year — two
 * batches' terms can genuinely overlap for a few days (an admission-
 * transition window: one batch's Year 1 Sem 2 and the next batch's
 * Year 1 Sem 1 can both have today inside their date range). When that
 * happens, the newest-started one wins (latest start_date) — same
 * recency convention resolveDefaultBatchIdForYear/currentTermId's own
 * fallback already use elsewhere in this file. When NOTHING is live
 * today (between semesters), falls back to the most recently reached
 * one, same fallback shape as currentTermId.
 */
export function useLiveTermForYear(yearNumber: number | undefined) {
  const { data: everyBatchTerms } = useAllBatchTerms();
  return useMemo(() => {
    if (yearNumber === undefined || !everyBatchTerms) return undefined;
    const todayKey = localDateKey(new Date().toISOString());
    const forYear = everyBatchTerms
      .filter((bt) => bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey))
      .sort((a, b) => b.start_date.localeCompare(a.start_date)); // newest-started first
    if (forYear.length === 0) return null;
    const live = forYear.find((bt) => todayKey <= bt.end_date);
    return (live ?? forYear[0]).term_id;
  }, [yearNumber, everyBatchTerms]);
}
