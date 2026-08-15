import "server-only";

/**
 * Fixed-window, per-process rate limiting for Server Actions — real
 * enforcement on the actual request path (every mutating action below
 * calls this before touching the database), not a package installed
 * and left unwired.
 *
 * Honest limitation: this Map lives in one serverless function
 * instance's memory. Vercel doesn't guarantee a single warm instance
 * handles every request from the same user — under real concurrent
 * load, traffic can land on multiple instances that each keep their
 * own counter, so a determined attacker could exceed the stated limit
 * by roughly the number of concurrent instances involved. This is
 * still a genuine, working control (it stops the common case: a
 * script or buggy retry loop hammering one action from one warm
 * instance) but it is NOT a hard distributed guarantee — that needs
 * an external store (Upstash Redis / Vercel KV), which this
 * deployment doesn't currently have provisioned. Swap the storage
 * layer here for one if that's ever added; every call site stays the
 * same.
 *
 * Server Actions aren't real HTTP endpoints (no app/api/* routes in
 * this codebase — see the architecture audit), so there's no response
 * object to set a literal 429 status or Retry-After header on. The
 * practical equivalent here is throwing a clear, user-facing error
 * that names the wait time — the action is genuinely rejected either
 * way, just surfaced as a thrown error instead of an HTTP status.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup — sweeps expired entries whenever the map
// grows past this size, so a long-running warm instance doesn't leak
// memory over one key per (action, user) pair forever. Cheap enough
// to just do inline; this app's action volume never makes it hot.
const SWEEP_THRESHOLD = 500;

function sweepExpired(now: number) {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * Throws if `identity` has made more than `limit` calls to `action`
 * within the trailing `windowMs`. Call this first, before any
 * database work, in every mutating Server Action. `identity` should
 * be the authenticated user's id (never a client-supplied value) —
 * these actions all require sign-in before this point anyway.
 */
export function checkRateLimit(action: string, identity: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweepExpired(now);

  const key = `${action}:${identity}`;
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new Error(`Too many requests — try again in ${retryAfterSeconds}s.`);
  }
}
