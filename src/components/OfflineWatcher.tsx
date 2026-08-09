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
 * navigator.onLine (and the offline/online events derived from it)
 * only reflects whether the network INTERFACE thinks it's connected —
 * not whether the internet is actually reachable. It's well known to
 * report stale/wrong values after sleep/wake, a Wi-Fi handoff, or VPN
 * state changes, especially on Safari/macOS. Trusting it blindly was
 * a real bug: a false "offline" reading redirected here, and because
 * the same flag gets re-checked on every mount, hitting Retry (a full
 * reload) just re-triggered the exact same wrong reading — a loop the
 * student could never escape even with working internet. A real fetch
 * is the only way to know for sure.
 */
async function checkRealConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    await fetch("/favicon.ico", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

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
    let cancelled = false;

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

    // navigator.onLine's own "offline" signal (both the property, read
    // here, and the browser's offline event below) is only a hint —
    // verified with a real fetch before ever acting on it, so a stale
    // or wrong reading can't trap anyone on the offline page. Going
    // online doesn't need the same verification: trusting a false
    // "online" signal just means a normal page load that fails the
    // usual way if it's actually still offline, not a stuck loop.
    if (!navigator.onLine) {
      checkRealConnectivity().then((isReallyOnline) => {
        if (!cancelled && !isReallyOnline) goOffline();
      });
    }

    // Hitting Retry on the offline page is a full window.location.reload()
    // (see offline/page.tsx) — a fresh mount of this whole component, on
    // the SAME /offline URL. If the connection is actually back by then,
    // navigator.onLine may already correctly say "online" (no state
    // transition happened, so the 'online' event below never fires) —
    // without this, nothing would ever navigate away from /offline again,
    // even once real connectivity returns. Checked unconditionally,
    // independent of what navigator.onLine claims.
    if (pathnameRef.current === OFFLINE_PATH) {
      checkRealConnectivity().then((isReallyOnline) => {
        if (!cancelled && isReallyOnline) goOnline();
      });
    }

    function handleOfflineEvent() {
      checkRealConnectivity().then((isReallyOnline) => {
        if (!cancelled && !isReallyOnline) goOffline();
      });
    }

    window.addEventListener("offline", handleOfflineEvent);
    window.addEventListener("online", goOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOfflineEvent);
      window.removeEventListener("online", goOnline);
    };
  }, [router]);

  return null;
}
