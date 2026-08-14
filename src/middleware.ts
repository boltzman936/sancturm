import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs on every matched request (see config.matcher below). Two jobs:
 *
 * 1. Refreshes an expiring session cookie for /cr/* — lib/supabase/
 *    server.ts's createClient() can READ the session cookie inside a
 *    Server Component but often can't WRITE it back (Server Components
 *    can't set cookies at all), so this is what actually persists a
 *    refreshed token, keeping a signed-in CR/admin from being silently
 *    logged out mid-session.
 * 2. Enforces site-wide maintenance mode (maintenance_config.until) —
 *    the actual security boundary: a non-admin visitor is redirected
 *    to /maintenance server-side, on every navigation, regardless of
 *    any client-side state. This is a two-tier check specifically to
 *    protect the property described in the matcher comment below —
 *    the common case (maintenance off) must stay exactly as cheap as
 *    it was before this existed: one small Postgres read, no Auth
 *    network call, for every route this now also covers.
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

  const isCrRoute = request.nextUrl.pathname.startsWith("/cr");

  // Cheap, no Auth network call — safe to run on every matched
  // request, including the vast majority where maintenance is off.
  const { data: maintenance } = await supabase.from("maintenance_config").select("until").single();
  // Fail OPEN on a read error (a transient Supabase blip, etc.) — an
  // availability feature must never itself cause an outage, and must
  // never risk locking the admin out of their own site.
  const until = maintenance?.until ? new Date(maintenance.until) : null;
  const maintenanceActive = !!until && until.getTime() > Date.now();

  if (maintenanceActive) {
    // Only pay the Auth round trip when maintenance is actually on —
    // this is the one extra cost this feature adds to the common path,
    // and it's skipped entirely while the site is live.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let isAdmin = false;
    if (user) {
      const { data: admin } = await supabase
        .from("admins")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      isAdmin = !!admin;
    }
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      return NextResponse.redirect(url);
    }
    // Admin: falls through to the normal response below, full access.
    return supabaseResponse;
  }

  // Unchanged original behavior — session refresh only ever fired for
  // /cr/* before maintenance mode existed, and still only does here.
  if (isCrRoute) {
    await supabase.auth.getUser();
  }

  return supabaseResponse;
}

export const config = {
  // Now covers every route except: Next's own static/image assets,
  // /maintenance itself (redirecting there again would loop), /login
  // (the admin must always be able to sign in, even mid-maintenance-
  // window with an expired/missing session, on any device — this is
  // the actual mechanism that prevents an admin lockout), /offline
  // (unrelated browser-network-offline page, left untouched), and any
  // path whose last segment has a file extension (covers every static
  // asset by pattern rather than an allowlist — App Router pages never
  // have a dot in their last segment, so this can't exclude a real
  // route, and it never needs updating when a new asset type appears).
  matcher: ["/((?!_next/static|_next/image|maintenance|login|offline|.*\\.[^/]+$).*)"],
};
