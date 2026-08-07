import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for the SERVER.
 *
 * Use this inside Server Components (page.tsx files that fetch data
 * directly, no "use client") and inside Server Actions (features/*\/actions.ts).
 * The key difference from client.ts: this one can read the CR's session
 * cookie, which is how a Server Action knows *which* CR is uploading or
 * approving something — student pages never hit this cookie logic at all,
 * since students aren't logged in.
 *
 * This is intentionally an async function (Next.js 15's `cookies()` is
 * async) — always `await createClient()` when you call it on the server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component in some cases,
            // where cookies can't be written. Safe to ignore — the
            // middleware (added in the backend milestone) refreshes
            // the session instead.
          }
        },
      },
    }
  );
}
