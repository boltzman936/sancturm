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
 * Batch+Semester scoping for student browsing (Notes/Lab/PYQ). The
 * sidebar's "Switch year" is an EQUALITY filter, not a ceiling: for a
 * specific batch, Semester options are only that batch's rows whose
 * term.year_number === the selected Year (both of a batch's own
 * semesters within that year, if reached — not a cumulative history
 * spanning earlier years, and never a future one). Switching Year for
 * the same batch shows a genuinely different set of options, not a
 * superset.
 *
 * "All batches" unions those same per-year exact-match rows across
 * every batch, deduped by term_id (preferring whichever batch's row
 * is actually live, for accurate dates) — so it can show MULTIPLE
 * options when different batches are at different points within the
 * same Year (e.g. Year 1: a brand-new batch's live Semester 1 AND an
 * older batch's already-finished Semester 2, side by side). Because
 * blending distinct batches like that makes "current" ambiguous
 * (whose current?), "All batches" never badges anything "(current)" —
 * only a specific single batch does. The Batch dropdown itself is
 * also scoped to the selected Year: only batches with a reached row
 * for that exact year are offered (see eligibleBatches), and "All
 * batches" itself is only offered when 2+ of them exist — a single
 * eligible batch makes "All batches" redundant, so the persisted
 * selection auto-collapses to that one batch instead.
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

  // Reached AND an exact match on the sidebar Year (year_number ===
  // yearNumber) — a specific batch only ever shows its OWN two
  // semesters within this Year, not a cumulative history spanning
  // earlier years too. Switching Year for the same batch shows a
  // genuinely different set, not a superset of it.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    if (yearNumber === undefined) return [];
    const source: ReachedTerm[] = (batchFilter === ALL_BATCHES ? everyBatchTerms : oneBatchTerms) ?? [];
    const reached = source.filter((bt) => bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey));
    if (batchFilter !== ALL_BATCHES) return reached;
    // "All batches": union across every batch (within this year),
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
  // silently querying a stale/invalid pairing.
  const validTermIds = useMemo(
    () => (isLoadingReachedTerms ? undefined : [null, ...reachedTerms.map((bt) => bt.term_id)]),
    [isLoadingReachedTerms, reachedTerms]
  );
  useResetInvalidSelection(termId, validTermIds, null, setTermIdState);

  const { data: allTerms } = useTerms();
  const effectiveTerm = allTerms?.find((t) => t.id === effectiveTermId);

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
    allBatches,
    eligibleBatches,
    batchFilter,
    setBatchFilter,
    reachedTerms,
    liveCurrentTermId,
    effectiveTermId,
    effectiveTerm,
    currentTermId,
    setTermId,
  };
}
