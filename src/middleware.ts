import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs on every request. lib/supabase/server.ts's createClient() can
 * READ the session cookie inside a Server Component but often can't
 * WRITE it back (Server Components can't set cookies at all) — this
 * is the piece that actually refreshes an expiring session and
 * persists the new cookie, so a signed-in CR/admin doesn't get
 * silently logged out mid-session once their access token ages out.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Touching getUser() is what triggers the refresh — it's the actual
  // point of this middleware, not the value itself.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  // Session refresh is only relevant to /cr/* — the only routes that
  // do a server-side auth check (CRLayout's getUser()). /login is a
  // Client Component that signs in via the browser SDK directly, no
  // server-side session read involved. Every public student page —
  // Notes, PYQs, Notices, Sancturm Updates, Ownership, onboarding —
  // never touches Supabase Auth at all, so it was paying for a real
  // network round trip to Supabase on every single navigation for
  // nothing — the majority of all traffic on the site.
  matcher: ["/cr/:path*"],
};
