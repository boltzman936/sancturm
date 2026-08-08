"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const OFFLINE_PATH = "/offline";
// Both variants — the page picks between them with a CSS breakpoint
// (see offline/page.tsx), so whichever one ends up visible needs to
// already be cached regardless of which width the device is at right
// now. Combined they're still under 200KB.
const OFFLINE_BG_SRCS = ["/images/no-internet-bg.webp", "/images/no-internet-bg-mobile.webp"];
// Where to send the student back to once they're reconnected —
// sessionStorage (not a ref) because the redirect to /offline is a
// full route change, and this needs to survive that.
const RETURN_PATH_KEY = "sancturm:pre-offline-path";

/**
 * Mounted once in the root layout. Three jobs:
 *  1. Prefetch /offline while still online, so the moment the
 *     connection actually drops, router.push() can resolve it from
 *     the client-side router cache instead of needing a network
 *     round-trip it can no longer make — the whole point of the page
 *     is to appear exactly when the network can't be reached.
 *  2. Warm the browser's HTTP cache with the offline page's
 *     background image for the same reason — prefetch above only
 *     covers the route's JS/RSC payload, not a plain <img> src the
 *     page loads separately.
 *  3. Watch the browser's online/offline events and swap the route
 *     in both directions.
 */
export function OfflineWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    router.prefetch(OFFLINE_PATH);
    // Plain Image() fetch, not next/image — this just needs the bytes
    // in the browser cache ahead of time, no resizing involved.
    for (const src of OFFLINE_BG_SRCS) {
      const img = new window.Image();
      img.src = src;
    }
  }, [router]);

  useEffect(() => {
    function goOffline() {
      if (pathnameRef.current === OFFLINE_PATH) return;
      window.sessionStorage.setItem(RETURN_PATH_KEY, pathnameRef.current);
      router.push(OFFLINE_PATH);
    }

    function goOnline() {
      if (pathnameRef.current !== OFFLINE_PATH) return;
      const returnPath = window.sessionStorage.getItem(RETURN_PATH_KEY) || "/";
      window.sessionStorage.removeItem(RETURN_PATH_KEY);
      router.replace(returnPath);
    }

    // Covers the page loading while already offline (e.g. a stale tab
    // resumed with no connection) — not just connectivity dropping
    // mid-session.
    if (!navigator.onLine) goOffline();

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [router]);

  return null;
}
