import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the BROWSER.
 *
 * Use this inside Client Components — anything marked "use client" — for
 * things like realtime subscriptions (Class Updates), submitting a rating,
 * or an upload form. It reads the public env vars, which is safe: the
 * anon key is meant to be exposed to the browser, and Row Level Security
 * (see supabase/migrations/) is what actually keeps data safe, not
 * hiding this key.
 *
 * Do NOT use this file inside Server Components or Server Actions —
 * see server.ts for that half of the split.
 *
 * A lazy module-level singleton, not a fresh client per call — every
 * page fires this from 5-8 different query hooks on mount
 * (useBranches, useTerms, useBatches, ...), and unlike server.ts (which
 * genuinely needs a new instance per request to read that request's own
 * cookies), the browser client has no per-call state to isolate: one
 * instance, one GoTrueClient, reused for the whole tab's lifetime.
 * `undefined` at module load (SSR: this file can still be imported
 * during server rendering of a "use client" component's initial pass,
 * where creating a real client would be wrong) — only ever constructed
 * on first actual browser-side call.
 */
// A plain non-generic function, not the bare createBrowserClient(...)
// call inlined below — ReturnType<> over a call to a GENERIC function
// (createBrowserClient<Database, SchemaName>(...)) re-resolves those
// type parameters from their bare defaults instead of however each
// original call site's context resolved them, which silently widened
// every .from(table).select(...) call across the app to an untyped
// shape (implicit-any on every callback param reading the result).
// Wrapping the actual call in this ordinary function first, then
// taking ReturnType<typeof makeBrowserClient>, preserves the exact
// same inferred type the original un-cached "new client every call"
// version had.
function makeBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let browserClient: ReturnType<typeof makeBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    browserClient = makeBrowserClient();
  }
  return browserClient;
}
