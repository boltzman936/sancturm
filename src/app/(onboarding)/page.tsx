import type { Viewport } from "next";
import { IntroExperience } from "@/features/branches/components/IntroExperience";

// Overrides the root layout's default viewport (which has no explicit
// export, so Next falls back to width=device-width, initial-scale=1 —
// pinch/double-tap zoom allowed, as it should be everywhere else in
// the app: Notes/PYQ/Notices etc. never define their own viewport, so
// they keep that default untouched). Cockpit is a fixed, full-bleed
// media experience, not scrollable/zoomable content, so it alone pins
// the scale — this export only ever applies to this route ("/").
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// bg-black wrapper, always rendered (not conditional on anything) —
// IntroExperience itself returns null until its own client-only
// isLoaded gate resolves (useBranch/useTerm read localStorage, not
// SSR-safe). That null state used to expose <body>'s real background
// underneath — var(--background), a warm cream/brown in every theme
// (see globals.css) — for a visible beat on first paint, the "warm
// flash" even after IntroExperience's own bg-black media wrapper was
// fixed. This div is server-rendered immediately, painting black from
// the very first frame, before any client JS runs at all.
export default function OnboardingPage() {
  return (
    // w-screen (literal viewport-width value), not just inset-0's own
    // left/right — globals.css sets `scrollbar-gutter: stable` on
    // <html> site-wide, which reserves a thin strip on the right edge
    // for a scrollbar even when nothing here scrolls; inset-0's
    // right:0 lands at the edge of that shrunk containing block, not
    // the true window edge, leaving the reserved strip unpainted and
    // exposing <body>'s own background as a thin colored line there.
    // w-screen is immune to that gutter reservation, so this always
    // fully covers it.
    //
    // Height, deliberately, is NOT set explicitly (no h-screen/h-dvh)
    // — inset-0 already includes top:0 + bottom:0, which for a `fixed`
    // element is sized against the real, current viewport with no vh
    // unit involved at all, so it's exact on every reflow. Every vh-
    // based unit tried here (h-screen's static 100vh, then h-dvh) went
    // wrong in a different way: 100vh measures mobile Chrome/Safari's
    // LARGEST possible viewport (bars collapsed), taller than what's
    // visible with the bars showing; 100dvh should track the real
    // toolbar state but still left a gap on real Android devices,
    // because setting an explicit height on a `fixed inset-0` element
    // over-constrains the box and makes the browser DROP the bottom:0
    // constraint in favor of top:0 + height — so any lag/inaccuracy in
    // that height value (dvh recalculates asynchronously as the
    // toolbar animates) shows up as a literal gap against the real
    // bottom edge. Leaving height unset keeps bottom:0 in force, which
    // has no such lag — it's just "the real bottom of the viewport,"
    // recomputed directly by layout rather than approximated by a unit.
    <div className="fixed inset-0 w-screen bg-black">
      <IntroExperience />
    </div>
  );
}
