"use client";

import { useEffect, useMemo, useState } from "react";
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
 * SELECTED BATCH is what determines academic progression — Semester
 * options are always "whichever periods this batch has reached so
 * far," per the real batch_terms calendar, never a fixed per-year
 * list. The sidebar's "Switch year" acts as a ceiling on top of that,
 * not an equality filter: picking "2nd Year" shows a batch's reached
 * semesters THROUGH year 2 (which, for a batch that's already gotten
 * that far, includes its earlier 1st-Year semesters too — a 2nd-Year
 * student's own 1st-Year notes stay one click away); picking "1st
 * Year" caps it back down to just that batch's 1st-Year semesters,
 * even for a batch that's since moved on to 2nd Year. A future
 * semester never appears regardless of the ceiling.
 *
 * Batch and Semester DEFAULTS are computed dynamically from the real
 * academic calendar (batch_terms dates) — never hardcoded, never
 * derived from which batch happens to have uploads — but once a
 * student explicitly picks a Batch or Semester, that choice is
 * respected and not silently overwritten; defaults are only
 * recomputed when the current selection actually becomes invalid
 * (typically: the sidebar Year changed to one the picked batch has no
 * reached content at or below).
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

  // Reached, capped at the sidebar Year as a CEILING (year_number <=
  // yearNumber) — not an equality filter. A batch that's progressed
  // past the selected year still shows its full progress up through
  // it (2nd Year + an advanced batch includes that batch's own 1st
  // Year semesters); a batch that hasn't reached the selected year at
  // all just shows whatever it has reached so far, still capped. A
  // semester past the ceiling, or not yet started regardless of the
  // ceiling, never appears.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    if (yearNumber === undefined) return [];
    const source: ReachedTerm[] = (batchFilter === ALL_BATCHES ? everyBatchTerms : oneBatchTerms) ?? [];
    const reached = source.filter((bt) => bt.term.year_number <= yearNumber && isDateReached(bt.start_date, todayKey));
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
  // "" when nothing in the (possibly ceiling-capped) list is actually
  // active, e.g. every reached semester in view has already finished.
  // This — not currentTermId below — is what the "(current)" badge
  // should be keyed on; conflating the two would badge a semester
  // that's merely the most-recently-finished one.
  //
  // Under "All batches", more than one batch can be genuinely mid-
  // semester at the same real-world moment (e.g. today, a brand-new
  // batch is mid Semester-1 AND an older batch is simultaneously mid
  // Semester-3) — reachedTerms can contain both as separate rows.
  // Picking whichever sorts first would badge the LOWER-year one as
  // "current" even while Year is set to the higher one, which reads as
  // nonsense ("2nd Year" defaulting to "1st Semester"). Prefer the
  // live term with the highest year_number instead — the one actually
  // relevant to whichever Year is in view.
  const liveCurrentTermId = useMemo(() => {
    const live = reachedTerms.filter((bt) => bt.start_date <= todayKey && todayKey <= bt.end_date);
    if (live.length === 0) return "";
    return live.reduce((best, bt) => (bt.term.year_number > best.term.year_number ? bt : best)).term_id;
  }, [reachedTerms, todayKey]);

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

  // Batch DEFAULT recomputation — fires only when actually needed:
  // first-ever visit (batchLabel never persisted), or the persisted/
  // picked batch isn't actually the one progressing through the
  // sidebar's CURRENT year (an exact year_number match, not the
  // reachedTerms ceiling above — this answers "is this batch AT this
  // year", not "does it have any older content still viewable here").
  // Deliberately exact: a batch that's only reached an EARLIER year
  // (like a brand-new batch still in Year 1) isn't "the" batch for a
  // later Year tab just because Year acts as a ceiling for what it
  // shows once picked — switching Year must visibly jump to that
  // year's own current batch, not silently keep showing an earlier
  // one under the hood. An explicit "All batches" choice is always
  // valid for any year and is never overridden. Never fires on a
  // timer/re-render alone — only reacts to an actual mismatch, so a
  // student's manual pick survives a refresh or the calendar date
  // quietly advancing mid-session.
  useEffect(() => {
    if (yearNumber === undefined || !everyBatchTerms || !allBatches) return;
    if (batchLabel === ALL_BATCHES) return;

    const pickedBatch = batchLabel ? allBatches.find((b) => b.label === batchLabel) : undefined;
    const currentlyValid =
      !!pickedBatch &&
      everyBatchTerms.some(
        (bt) =>
          bt.batch_id === pickedBatch.id && bt.term.year_number === yearNumber && isDateReached(bt.start_date, todayKey)
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
    liveCurrentTermId,
    effectiveTermId,
    effectiveTerm,
    currentTermId,
    setTermId,
  };
}
