"use client";

import { useEffect, useMemo, useState } from "react";
import { useBatches, useBatchTerms, useAllBatchTerms } from "@/features/batches/queries";
import { useTerms, useTermBySlug } from "@/features/terms/queries";
import { useBatch } from "@/hooks/useBatch";
import { useTerm } from "@/hooks/useTerm";
import { useResetInvalidSelection } from "./useResetInvalidSelection";
import { localDateKey } from "@/lib/date";
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
  const forYear = everyBatchTerms.filter((bt) => bt.term.year_number === yearNumber && bt.start_date <= todayKey);
  if (forYear.length === 0) return null;
  const current = forYear.find((bt) => todayKey <= bt.end_date);
  const chosen = current ?? forYear.reduce((latest, bt) => (bt.start_date > latest.start_date ? bt : latest));
  return chosen.batch_id;
}

/**
 * Batch+Semester scoping for student browsing (Notes/Lab/PYQ) — the
 * sidebar's "Switch year" (existing, untouched UI) is the real input:
 * Semester options never span years (1st Year only ever offers its
 * own 2 semesters, never a 2nd-Year one), and "the current batch" is
 * always resolved relative to whichever year the sidebar has picked.
 * Batch and Semester DEFAULTS are computed dynamically from the real
 * academic calendar (batch_terms dates) — never hardcoded, never
 * derived from which batch happens to have uploads — but once a
 * student explicitly picks a Batch or Semester, that choice is
 * respected and not silently overwritten; defaults are only
 * recomputed when the current selection actually becomes invalid
 * (typically: the sidebar Year changed to one the picked batch hasn't
 * reached).
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

  // Reached AND scoped to the sidebar's Year — even under "All
  // batches", Semester never spans years: 1st Year never shows
  // Semester 3, 2nd Year never shows Semester 1.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    if (yearNumber === undefined) return [];
    const source: ReachedTerm[] = (batchFilter === ALL_BATCHES ? everyBatchTerms : oneBatchTerms) ?? [];
    const reached = source.filter((bt) => bt.term.year_number === yearNumber && bt.start_date <= todayKey);
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

  // null = defer to whichever period is calendar-current.
  const [termId, setTermIdState] = useState<string | null>(null);
  const currentTermId = useMemo(() => {
    if (reachedTerms.length === 0) return "";
    const current = reachedTerms.find((bt) => bt.start_date <= todayKey && todayKey <= bt.end_date);
    return (current ?? reachedTerms[reachedTerms.length - 1]).term_id;
  }, [reachedTerms, todayKey]);
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

  // Batch DEFAULT recomputation — fires only when actually needed:
  // first-ever visit (batchLabel never persisted), or the persisted/
  // picked batch no longer has a reached row for the sidebar's
  // CURRENT year (most commonly: the sidebar Year just changed to one
  // this batch hasn't gotten to, or already passed). An explicit "All
  // batches" choice is always valid for any year and is never
  // overridden. Never fires on a timer/re-render alone — only reacts
  // to an actual mismatch, so a student's manual pick survives a
  // refresh or the calendar date quietly advancing mid-session.
  useEffect(() => {
    if (yearNumber === undefined || !everyBatchTerms || !allBatches) return;
    if (batchLabel === ALL_BATCHES) return;

    const pickedBatch = batchLabel ? allBatches.find((b) => b.label === batchLabel) : undefined;
    const currentlyValid =
      !!pickedBatch &&
      everyBatchTerms.some(
        (bt) => bt.batch_id === pickedBatch.id && bt.term.year_number === yearNumber && bt.start_date <= todayKey
      );
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
  }, [yearNumber, everyBatchTerms, allBatches, batchLabel, todayKey, persistBatch]);

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
    batchFilter,
    setBatchFilter,
    reachedTerms,
    effectiveTermId,
    effectiveTerm,
    currentTermId,
    setTermId,
  };
}
