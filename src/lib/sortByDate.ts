export type DateSortOrder = "newest" | "oldest";

// The one place batch-priority ordering is decided — never alphabetical
// on the batch label, always the batch's start_year, so a future batch
// (e.g. "2027-28") sorts correctly with zero code changes. Newer batch
// always wins regardless of the Newest/Oldest date-sort direction —
// that direction only ever affects ordering WITHIN a batch, never
// whether one batch's resources appear before another's.
function compareByAcademicBatch(
  a: { batch_id: string | null },
  b: { batch_id: string | null },
  batchStartYear: Map<string, number>
): number {
  const aYear = a.batch_id ? (batchStartYear.get(a.batch_id) ?? -Infinity) : -Infinity;
  const bYear = b.batch_id ? (batchStartYear.get(b.batch_id) ?? -Infinity) : -Infinity;
  return bYear - aYear;
}

// Batch (newest first) -> pinned -> created_at (direction per `order`).
// Shared by every resource listing with a pin concept (Notes, Lab, PYQ,
// PYQ Solution) so batch grouping can't drift between pages. Pass a
// batchId -> start_year lookup built from whichever batches list the
// caller already has loaded (useBatches/useBatchesForTerm) — this sorts
// the same bounded, already-fetched set every page already sorts by
// date; it doesn't fetch anything extra.
export function sortByAcademicPriority<T extends { created_at: string; is_pinned: boolean; batch_id: string | null }>(
  items: T[],
  order: DateSortOrder,
  batchStartYear: Map<string, number>
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const batchDiff = compareByAcademicBatch(a, b, batchStartYear);
    if (batchDiff !== 0) return batchDiff;
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return order === "newest" ? diff : -diff;
  });
  return sorted;
}

// Same batch-first rule as sortByAcademicPriority, without the pin
// tier — Manage's rows aren't consistently typed with is_pinned
// (notice/update rows are built without it), and its flat date-sort
// never had pin-priority to begin with; this only adds batch grouping
// on top of that existing behavior, not a new pin concept.
export function sortResourcesByBatchThenDate<T extends { created_at: string; batch_id: string | null }>(
  items: T[],
  order: DateSortOrder,
  batchStartYear: Map<string, number>
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const batchDiff = compareByAcademicBatch(a, b, batchStartYear);
    if (batchDiff !== 0) return batchDiff;
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return order === "newest" ? diff : -diff;
  });
  return sorted;
}
