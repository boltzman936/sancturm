"use client";

import { useEffect, useState } from "react";

// 640px matches the same sm breakpoint used everywhere else in the
// app (Sidebar's own width steps, Tailwind's own defaults) — one
// shared definition of "mobile" for anywhere that needs to pick a
// different asset per tier (Cockpit, Maintenance, the offline/error
// page), rather than three components each re-deriving their own
// number.
//
// tablet vs. desktop is NOT a width check — a plain "min-width: 1024px
// = desktop" breakpoint misclassifies any tablet whose width happens
// to reach 1024px (an iPad Pro is 1024px wide in portrait, 1366px in
// landscape — both comfortably past that threshold despite being
// exactly the tablet case this tier exists for). The actual signal
// that distinguishes them isn't a screen-size number at all — it's
// whether the device's PRIMARY input is touch (a tablet/phone) or a
// mouse/trackpad (a laptop/desktop), which is what `pointer` reports
// (not `any-pointer`, which would also flag a touchscreen laptop with
// a trackpad as "coarse" just because touch is AVAILABLE — `pointer`
// reflects which one is primary). This is why the tier now genuinely
// tracks device/layout kind, not a handful of hardcoded resolutions —
// any tablet at any width/orientation resolves correctly without a
// device-specific exception ever being added here.
const MOBILE_WIDTH_QUERY = "(max-width: 640px)";
const TOUCH_PRIMARY_QUERY = "(pointer: coarse)";

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
  if (window.matchMedia(TOUCH_PRIMARY_QUERY).matches) return "tablet";
  return "desktop";
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
    const touchQuery = window.matchMedia(TOUCH_PRIMARY_QUERY);
    const handler = () => setTier(resolveTier());
    mobileQuery.addEventListener("change", handler);
    touchQuery.addEventListener("change", handler);
    return () => {
      mobileQuery.removeEventListener("change", handler);
      touchQuery.removeEventListener("change", handler);
    };
  }, []);
  return tier;
}
