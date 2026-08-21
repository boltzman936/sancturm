import "server-only";

/**
 * Shared server-side input validation for every Server Action —
 * frontend validation (maxLength on an <input>, a disabled Save
 * button) is real UX but proves nothing here: every action in this
 * app is a plain POST endpoint under the hood, callable directly with
 * any payload regardless of what the UI ever allowed. Centralized so
 * every caller enforces the same limits instead of each action
 * re-deciding its own, and so raising/lowering a limit later is a
 * one-line change instead of a grep-and-fix across the codebase.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws unless `value` is a syntactically valid UUID — the shape every id in this schema actually has. */
export function assertValidId(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}.`);
  }
}

/** Same as assertValidId, but allows null/undefined through (for genuinely optional fields like subject_id). */
export function assertValidIdOrNull(value: unknown, fieldName: string): asserts value is string | null | undefined {
  if (value === null || value === undefined) return;
  assertValidId(value, fieldName);
}

// Bulk-publish pickers (branches, years) only ever offer a handful of
// real options — this exists to reject an absurd/malformed array
// (thousands of entries) rather than to constrain a legitimate pick.
const MAX_BULK_ID_COUNT = 50;

/** Validates a JSON-parsed array is non-empty, bounded, and every entry is a real UUID. */
export function assertValidIdArray(value: unknown, fieldName: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_ID_COUNT) {
    throw new Error(`Invalid ${fieldName} selection.`);
  }
  for (const id of value) assertValidId(id, fieldName);
}

/**
 * Bounds and type-checks a free-text field. `required: false` still
 * rejects wrong types (a number, an object) — it only allows an empty
 * string through — matching how every optional text field in this
 * schema (description, message, ...) is actually stored: "" or null,
 * never some other JS type a crafted request could otherwise smuggle
 * through untouched into an insert.
 */
export function assertValidString(
  value: unknown,
  fieldName: string,
  { maxLength, required = true }: { maxLength: number; required?: boolean }
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${fieldName}.`);
  }
  if (required && value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
  if (value.length > maxLength) {
    throw new Error(`${fieldName} is too long (max ${maxLength} characters).`);
  }
}

/** yyyy-mm-dd only — every dateKey in this app (DateFilterInput, Calendar) is already exactly this shape. */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// IST, not UTC — Sancturm's whole audience is in India, and a UTC
// comparison would falsely reject a genuinely-"today" pick (or falsely
// allow a "tomorrow" one) during the ~5.5 hour window where IST's date
// and UTC's date disagree. en-CA is just the shortest built-in locale
// that happens to format as yyyy-mm-dd — no timezone math of its own,
// Intl does that.
function todayKeyIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Every real caller of this (updateResourceFields/updateNoticeFields/
 * updateSancturmUpdateDate's dateKey) is retroactively setting an
 * already-published item's date — never a forward-looking one, so
 * rejecting anything after today is a real content rule here, not
 * just format validation. Calendar.tsx already disables picking a
 * future day client-side (see its own maxDate default); this is the
 * matching server-side enforcement so a crafted request can't bypass
 * that UI restriction.
 */
export function assertValidDateKey(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${fieldName}.`);
  }
  if (value > todayKeyIST()) {
    throw new Error(`${fieldName} can't be in the future.`);
  }
}

/**
 * Same future-date rule as assertValidDateKey, for the one caller that
 * stores a full ISO timestamp instead of a bare date (uploadResourceDirect
 * / uploadResourceDirectAllBranches' customCreatedAt — kept as a full
 * timestamp so same-day uploads still sort correctly against each
 * other, see actions.ts's own comment). A plain absolute-time
 * comparison is correct here (no IST/UTC ambiguity like the bare-date
 * case above) since the value already carries real time-of-day
 * precision.
 */
export function assertNotFutureTimestamp(value: string, fieldName: string): void {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid ${fieldName}.`);
  if (parsed > Date.now()) throw new Error(`${fieldName} can't be in the future.`);
}

// Field-length ceilings — generous enough that no real title/
// description/message ever brushes against them, tight enough that a
// crafted request can't shove megabytes of text into one row.
export const MAX_TITLE_LENGTH = 300;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_MESSAGE_LENGTH = 5000;

/**
 * Logs the real error server-side (where a developer can actually see
 * it) and throws a clean, generic message instead of re-throwing the
 * raw Postgres/Supabase error — which can carry constraint names,
 * column names, or other schema detail a student/CR has no reason to
 * see. Every call site that used to do `if (error) throw error;`
 * should do `if (error) throw safeDbError(error);` instead. Return
 * type is `never` so a caller doesn't need its own `return`/`throw`
 * after calling this — it always throws.
 */
export function safeDbError(error: unknown): never {
  console.error(error);
  throw new Error("Something went wrong. Please try again.");
}
