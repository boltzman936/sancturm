"use client";

import { useEffect, useState } from "react";

// Mirrors Tailwind's own `md` breakpoint (768px) — the exact width
// Sidebar already switches on for "off-canvas drawer vs. permanent
// column" (see its own `md:` classes). Anything the swipe-gesture
// wiring needs to know "is this the drawer right now" must use this
// same threshold, or a mid-resize window could end up with gesture
// logic and CSS layout disagreeing about which mode is active.
const DRAWER_QUERY = "(max-width: 767px)";

// Starts `false` (matches the server's only real option — no viewport
// to check) so the very first client render's DOM structure doesn't
// depend on window state React hasn't been told about yet, avoiding a
// hydration mismatch on anything gated by this value. Actual devices
// are almost always narrower than this default only for a single
// frame before the effect below corrects it.
export function useIsMobileDrawer(): boolean {
  const [isMobileDrawer, setIsMobileDrawer] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(DRAWER_QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolving real viewport state post-mount, same pattern as useDeviceTier
    setIsMobileDrawer(query.matches);
    const handler = () => setIsMobileDrawer(query.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return isMobileDrawer;
}
