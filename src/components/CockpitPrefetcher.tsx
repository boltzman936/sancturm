"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDeviceTier } from "@/hooks/useDeviceTier";

// Keyed by device tier, same reasoning as OfflineWatcher's own
// OFFLINE_BG_SRC_BY_TIER — a given device can only ever end up showing
// ONE of these (its tier doesn't change mid-session), so only that
// one's own background media needs warming.
const COCKPIT_MEDIA_SRC_BY_TIER = {
  mobile: "/media/cockpit-mobile.mp4",
  tablet: "/media/cockpit-tablet.webp",
  desktop: "/media/cockpit-desktop.webp",
} as const;

/**
 * Mounted once in the root layout, alongside OfflineWatcher — the
 * "sancturm" wordmark (Sidebar, AppLayout's mobile header) links back
 * to Cockpit from every page under (app), and clicking it used to
 * visibly stall: Cockpit's own background media (a several-hundred-KB
 * video on mobile, a large image on tablet/desktop) had never been
 * fetched yet, so the click kicked off a fresh network request before
 * anything could paint. Warming both the route (router.prefetch) and
 * the media (a plain fetch, not next/image — this only needs the
 * bytes sitting in the browser's HTTP cache ahead of time, no
 * resizing) while someone's already browsing the rest of the app
 * means that by the time they actually click back to Cockpit, both
 * are already local — the click just re-renders instantly instead of
 * waiting on a round-trip.
 */
export function CockpitPrefetcher() {
  const router = useRouter();
  const deviceTier = useDeviceTier();

  useEffect(() => {
    router.prefetch("/");
    fetch(COCKPIT_MEDIA_SRC_BY_TIER[deviceTier], { cache: "force-cache" }).catch(() => {});
  }, [router, deviceTier]);

  return null;
}
