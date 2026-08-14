// The one shared "has this academic period actually started yet"
// check — pure string comparison, no browser or Node-specific API, so
// it works identically from a client hook (Notes/PYQs/Upload's own
// dropdown filtering) and a server action (Upload's insert
// validation) without needing two copies of the same rule that could
// drift apart. `todayKey`/`startDate` are both yyyy-mm-dd strings
// (see src/lib/date.ts's localDateKey) — lexicographic comparison
// works correctly for that format.
export function isDateReached(startDate: string, todayKey: string): boolean {
  return startDate <= todayKey;
}
