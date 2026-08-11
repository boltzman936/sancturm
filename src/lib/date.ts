/**
 * The calendar date an ISO timestamp falls on in the VIEWER'S LOCAL
 * timezone, as yyyy-mm-dd — matching both what <input type="date">
 * produces and what toLocaleDateString() displays.
 *
 * `iso.slice(0, 10)` looks like it does the same thing but doesn't —
 * it reads the date portion straight out of the UTC-stamped string
 * Postgres returns, not the local calendar date. Anything created in
 * the evening UTC (which is past midnight in IST) then displays as
 * "the next day" via toLocaleDateString, while the date FILTER was
 * still comparing against the UTC day — so filtering for "7 Aug"
 * could show an item the list itself displays as "8 Aug". This is
 * what every date filter (Notes, PYQs, Notices, Sancturm Updates,
 * Manage) should compare against instead.
 */
export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Aug 9, 2026" — the display/search format used everywhere a
 * timestamp is shown as a short date (resource cards, notices,
 * Sancturm updates, Manage, the PYQs/Notes search-by-date match).
 * Previously copy-pasted verbatim into six different files.
 */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Swaps just the calendar day of an existing ISO timestamp onto a new
 * yyyy-mm-dd, keeping the original time-of-day — used when an admin
 * retroactively edits an already-published item's date from Manage, so
 * the edit doesn't also bump it to "now" and disturb its ordering
 * against same-day items. Built with the local Date constructor (not
 * new Date("yyyy-mm-dd"), which parses as UTC midnight) for the same
 * timezone-safety reason as CRUploadForm's customCreatedAt.
 */
export function withDateKey(iso: string, dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const original = new Date(iso);
  return new Date(
    year,
    month - 1,
    day,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds()
  ).toISOString();
}
