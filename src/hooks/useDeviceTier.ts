"use client";

import { useEffect, useState } from "react";

// 640px/1024px match the same sm/lg breakpoints used everywhere else
// in the app (Sidebar's own width steps, Tailwind's own defaults) —
// one shared definition of "mobile/tablet/desktop" for anywhere that
// needs to pick a different asset per tier (Cockpit, Maintenance, the
// offline/error page), rather than three components each re-deriving
// their own breakpoint numbers.
const MOBILE_WIDTH_QUERY = "(max-width: 640px)";
const DESKTOP_WIDTH_QUERY = "(min-width: 1024px)";

export type DeviceTier = "mobile" | "tablet" | "desktop";

// The server has no viewport to check — this is the ONE value every
// server-rendered page commits to, and it's what this hook's initial
// client render must also start as, on purpose, even though it's
// often wrong. Resolving the REAL tier in the lazy useState
// initializer instead (i.e. actually calling matchMedia before first
// paint) would make the very first CLIENT render disagree with the
// server's HTML for any non-desktop viewport — a genuine React
// hydration-mismatch warning, not just a cosmetic one, since the
// server and client would render a different <img src>/<video src>.
// Resolving the real tier in an effect (below) instead means the
// first paint always matches the server, and only self-corrects a
// moment later if the real device isn't desktop — a brief, one-frame
// "wrong asset" flash is the accepted tradeoff for zero hydration
// warnings, and it resolves before most people would ever notice.
const SERVER_TIER: DeviceTier = "desktop";

function resolveTier(): DeviceTier {
  if (window.matchMedia(MOBILE_WIDTH_QUERY).matches) return "mobile";
  if (window.matchMedia(DESKTOP_WIDTH_QUERY).matches) return "desktop";
  return "tablet";
}

/**
 * Which of the 3 responsive asset tiers the current viewport is in —
 * see SERVER_TIER's own comment for why this always starts as
 * "desktop" and corrects itself post-mount, rather than trying to
 * guess the real value up front.
 */
export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(SERVER_TIER);
  useEffect(() => {
    // Deliberate — see SERVER_TIER's own comment for why the real
    // tier can only ever be resolved post-mount, never in the
    // initial render itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTier(resolveTier());
    const mobileQuery = window.matchMedia(MOBILE_WIDTH_QUERY);
    const desktopQuery = window.matchMedia(DESKTOP_WIDTH_QUERY);
    const handler = () => setTier(resolveTier());
    mobileQuery.addEventListener("change", handler);
    desktopQuery.addEventListener("change", handler);
    return () => {
      mobileQuery.removeEventListener("change", handler);
      desktopQuery.removeEventListener("change", handler);
    };
  }, []);
  return tier;
}
