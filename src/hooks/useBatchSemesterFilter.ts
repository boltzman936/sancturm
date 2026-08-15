"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBatches, useBatchTerms, useAllBatchTerms } from "@/features/batches/queries";
import { useTerms, useTermBySlug } from "@/features/terms/queries";
import { useBatch } from "@/hooks/useBatch";
import { useTerm } from "@/hooks/useTerm";
import { useResetInvalidSelection } from "./useResetInvalidSelection";
import { localDateKey } from "@/lib/date";
import { isDateReached } from "@/features/batches/academicChronology";
import type { BatchTerm, AcademicTerm } from "@/types/database";

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
 * A specific Batch's Semester options are a CEILING across that
 * batch's entire run so far — every period it has actually reached,
 * regardless of which sidebar Year happens to be selected right now.
 * A batch doesn't stop having history just because you're looking at
 * it from a lower Year tab: once 2025-26 has reached Semester 3, that
 * shows up as an option for that batch immediately, even under "1st
 * Year" (its own Semester 1/2 remain selectable there too, as
 * history) — see hideSemesterFilter below for why this needs to be
 * genuinely date-driven rather than tied to which Year tab is active.
 * The sidebar Year's real job is picking which Batch to land on by
 * default (resolveDefaultBatchIdForYear) and which Batches are even
 * offered as choices (eligibleBatches, still year-scoped — "was this
 * batch ever AT this year" is a different question from "how far has
 * it gotten since").
 *
 * "All batches" is the one place that stays scoped to the exact
 * selected Year — it exists specifically to compare PEER batches at
 * the same academic level side by side (e.g. Year 1: a brand-new
 * batch's live Semester 1 next to an older batch's already-finished
 * Semester 2), which is a genuinely different question from "how far
 * along is this one batch." Deduped by term_id (preferring whichever
 * batch's row is actually live, for accurate dates). Because blending
 * distinct batches like that makes "current" ambiguous (whose
 * current?), "All batches" never badges anything "(current)" — only a
 * specific single batch does. "All batches" itself is only offered
 * when 2+ eligible batches exist for this Year — a single eligible
 * batch makes it redundant, so the persisted selection auto-collapses
 * to that one batch instead.
 *
 * Batch and Semester DEFAULTS are computed dynamically from the real
 * academic calendar (batch_terms dates) — never hardcoded, never
 * derived from which batch happens to have uploads. A Batch pick is
 * respected across re-renders and page refreshes within the SAME
 * Year, but a genuine sidebar Year switch always resets Batch to that
 * year's own default — Year is meant to feel like a real refresh, not
 * something that can leave a stale batch pick from the previous Year
 * silently in place just because it happens to still be technically
 * valid there too.
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

  const { data: oneBatchTerms } = useBatchTerms(batchFilter !== ALL_BATCHES ? batchFilter : null);
  const { data: everyBatchTerms } = useAllBatchTerms();

  const todayKey = localDateKey(new Date().toISOString());

  // A specific batch: every period it has actually reached, full
  // ceiling across its whole run — see this hook's own doc comment
  // for why that's not scoped to the sidebar Year. "All batches"
  // stays scoped to the exact Year (peer comparison) — see the same
  // comment.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    if (yearNumber === undefined) return [];
    if (batchFilter !== ALL_BATCHES) {
      return (oneBatchTerms ?? [])
        .filter((bt) => isDateReached(bt.start_date, todayKey))
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
  // claim; see liveCurrentTermId for that.
  const [termId, setTermIdState] = useState<string | null>(null);
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
  // period to pick between. Today that means 1st Year (batch 2026-27
  // has reached only Semester 1 so far) hides it while 2nd Year
  // (2025-26 has reached three periods total) shows it — but this is a
  // live COUNT, not a hardcoded "1st Year never shows it" rule: the
  // moment 2026-27 reaches its own Semester 2 (per batch_terms'
  // configured start date, no code change needed), reachedTerms.length
  // becomes 2 and the picker appears on its own. Every page that would
  // otherwise render a Semester <select> checks this one flag instead
  // of re-deriving the rule itself.
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

  // Tracks the last sidebar Year this hook actually reacted to, purely
  // to distinguish "the page loaded/re-rendered while already on this
  // Year" (respect whatever's persisted, if still valid) from "the
  // student just clicked Switch Year to a NEW one" (always jump to
  // that year's own default batch, even if the old pick would still
  // technically be valid there too — a genuine Year switch should
  // read as a real refresh, not silently keep showing a leftover pick
  // from the previous Year).
  const lastYearRef = useRef<number | undefined>(undefined);

  // Batch DEFAULT recomputation — fires only when actually needed:
  // first-ever visit (batchLabel never persisted), a genuine Year
  // switch (see lastYearRef above), the persisted/picked batch isn't
  // actually AT the sidebar's current year (exact year_number match),
  // or "All batches" is persisted but only one batch is eligible for
  // this year (offering "All batches" next to a single real option is
  // redundant, and the Batch <select> won't even render it — see
  // eligibleBatches — so the persisted choice needs to point at
  // something that's actually rendered).
  useEffect(() => {
    if (yearNumber === undefined || !everyBatchTerms || !allBatches || !eligibleBatches) return;

    const yearSwitched = lastYearRef.current !== undefined && lastYearRef.current !== yearNumber;
    lastYearRef.current = yearNumber;

    if (batchLabel === ALL_BATCHES) {
      if (eligibleBatches.length === 1) persistBatch(eligibleBatches[0].label);
      return;
    }

    const pickedBatch = batchLabel ? allBatches.find((b) => b.label === batchLabel) : undefined;
    const currentlyValid = !yearSwitched && !!pickedBatch && eligibleBatches.some((b) => b.id === pickedBatch.id);
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
    setTermIdState(null); // defer to the new batch's current period
  }

  function setTermId(id: string) {
    setTermIdState(id);
  }

  return {
    yearNumber,
    allBatches,
    eligibleBatches,
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
