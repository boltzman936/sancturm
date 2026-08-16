import "server-only";
import { headers } from "next/headers";

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

function checkBucket(key: string, limit: number, windowMs: number, now: number) {
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

// x-forwarded-for can be a comma-separated chain across proxy hops —
// the first entry is the original client, which is what Vercel's own
// edge network sets it to. Falls back to x-real-ip (some proxies only
// set that one), then "unknown" if genuinely absent (e.g. local dev
// without either header) — the per-user bucket below still applies
// either way, this is purely the secondary layer.
async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip");
}

// How much more traffic the IP-wide ceiling tolerates versus one
// user's own limit — generous on purpose. A hostel floor or campus
// building sharing one NAT'd IP can easily have several genuine users
// each within their own per-user limit at once; this only exists to
// catch a single IP running meaningfully MORE than that (e.g. a
// script cycling through several accounts to route around the
// per-user check), not to cap ordinary shared-network usage.
const IP_LIMIT_MULTIPLIER = 5;

/**
 * Throws if `identity` has made more than `limit` calls to `action`
 * within the trailing `windowMs`. Call this first, before any
 * database work, in every mutating Server Action. `identity` should
 * be the authenticated user's id (never a client-supplied value) —
 * these actions all require sign-in before this point anyway.
 *
 * Also enforces a second, looser ceiling keyed on the request's IP
 * (see IP_LIMIT_MULTIPLIER) — the per-user check alone can be routed
 * around by signing in as a different account from the same machine;
 * this closes that gap without tightening the limit anyone on a
 * shared network actually experiences.
 *
 * Async because reading the request's IP (next/headers) is async in
 * the App Router — every call site must `await` this, or a thrown
 * limit-exceeded error becomes an unhandled promise rejection instead
 * of actually blocking the action.
 */
export async function checkRateLimit(action: string, identity: string, limit: number, windowMs: number) {
  const now = Date.now();
  sweepExpired(now);

  checkBucket(`${action}:${identity}`, limit, windowMs, now);

  const ip = await getClientIp();
  if (ip) {
    checkBucket(`${action}:ip:${ip}`, limit * IP_LIMIT_MULTIPLIER, windowMs, now);
  }
}
