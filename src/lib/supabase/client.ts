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
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
