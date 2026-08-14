"use client";

import { useEffect, useMemo, useState } from "react";
import { useBatches, useBatchTerms, useAllBatchTerms } from "@/features/batches/queries";
import { useTerms } from "@/features/terms/queries";
import { useBatch } from "@/hooks/useBatch";
import { useTerm } from "@/hooks/useTerm";
import { useResetInvalidSelection } from "./useResetInvalidSelection";
import { localDateKey } from "@/lib/date";
import type { BatchTerm, AcademicTerm } from "@/types/database";

export const ALL_BATCHES = "all";

type ReachedTerm = BatchTerm & { term: AcademicTerm };

/**
 * Batch-primary academic scoping for student browsing (Notes/Lab/PYQ) —
 * the same model CRUploadForm already uses: Batch picked first (or
 * "All batches"), Semester scoped to whichever periods that batch has
 * actually reached (a batch new to 1st Year offers just its own 2
 * semesters; one further along offers every one it's passed through,
 * spanning multiple years). Year is never picked independently — it's
 * derived from whichever Semester ends up in effect (see
 * `effectiveTerm.year_number`).
 *
 * A single shared hook so Notes and PYQs can't drift out of sync on
 * this logic the way they already did once this session.
 */
export function useBatchSemesterFilter() {
  const { data: allBatches } = useBatches(); // config-driven, newest first
  const { batch: batchLabel, setBatch: persistBatch } = useBatch();
  const batchFilter = useMemo(() => {
    if (!batchLabel || batchLabel === ALL_BATCHES) return ALL_BATCHES;
    return allBatches?.find((b) => b.label === batchLabel)?.id ?? ALL_BATCHES;
  }, [batchLabel, allBatches]);

  const { data: oneBatchTerms } = useBatchTerms(batchFilter !== ALL_BATCHES ? batchFilter : null);
  const { data: everyBatchTerms } = useAllBatchTerms();

  const todayKey = localDateKey(new Date().toISOString());
  // Reached (current or past) periods only — a semester that hasn't
  // started yet isn't selectable until its calendar window actually
  // begins. No upper bound here, so a completed semester stays
  // available permanently.
  const reachedTerms = useMemo<ReachedTerm[]>(() => {
    const source: ReachedTerm[] = (batchFilter === ALL_BATCHES ? everyBatchTerms : oneBatchTerms) ?? [];
    const reached = source.filter((bt) => bt.start_date <= todayKey);
    if (batchFilter !== ALL_BATCHES) return reached;
    // "All batches": union across every batch, deduped by term_id — if
    // ANY batch has reached a period, it's a valid option here. A
    // term_id can be shared by two batches at different points in
    // their own progression (e.g. "1st Year Sem 1" for both a
    // long-established batch, now past it, and a brand-new one,
    // currently in it) — prefer whichever batch's row is actually
    // CURRENT for the "(current)" check below, not just whichever
    // sorts first, or a currently-active period could silently lose
    // its marker to an older batch's already-finished one.
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
  }, [batchFilter, oneBatchTerms, everyBatchTerms, todayKey]);

  const isLoadingReachedTerms = batchFilter === ALL_BATCHES ? everyBatchTerms === undefined : oneBatchTerms === undefined;

  // null = defer to whichever period is calendar-current.
  const [termId, setTermIdState] = useState<string | null>(null);
  const currentTermId = useMemo(() => {
    if (reachedTerms.length === 0) return "";
    const current = reachedTerms.find((bt) => bt.start_date <= todayKey && todayKey <= bt.end_date);
    return (current ?? reachedTerms[reachedTerms.length - 1]).term_id;
  }, [reachedTerms, todayKey]);
  const effectiveTermId = termId ?? currentTermId;

  // Batch changed underneath an explicit Semester pick that batch
  // hasn't reached — defer back to that batch's current period instead
  // of silently querying a stale/invalid pairing.
  const validTermIds = useMemo(
    () => (isLoadingReachedTerms ? undefined : [null, ...reachedTerms.map((bt) => bt.term_id)]),
    [isLoadingReachedTerms, reachedTerms]
  );
  useResetInvalidSelection(termId, validTermIds, null, setTermIdState);

  const { data: allTerms } = useTerms();
  const effectiveTerm = allTerms?.find((t) => t.id === effectiveTermId);

  // Keeps the sidebar's "Switch year" display truthful — Batch+Semester
  // is the real academic scope here, so the sidebar (a separate,
  // globally-persisted control also used on Notices/onboarding/etc.)
  // must never show a Year that contradicts what's actually selected
  // (e.g. sidebar says "1st Year" while this page is showing 2025-26's
  // 3rd Semester content). One-way only — this pushes the derived Year
  // out to the sidebar; it does not read the sidebar back in, so
  // there's no feedback loop.
  const { setTerm: syncSidebarTerm } = useTerm();
  useEffect(() => {
    if (effectiveTerm) syncSidebarTerm(effectiveTerm.slug);
  }, [effectiveTerm, syncSidebarTerm]);

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
