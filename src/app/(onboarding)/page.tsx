import { Suspense } from "react";
import { IntroExperience } from "@/features/branches/components/IntroExperience";

// Suspense boundary required by IntroExperience's own useSearchParams()
// call (reads ?cockpit=1 — see its own comment) — without it, Next
// can't statically prerender this page at all and the build fails
// outright, not just warns.
//
// bg-black wrapper, always rendered (not conditional on anything) —
// IntroExperience itself returns null until its own client-only
// isLoaded gate resolves (useBranch/useTerm read localStorage, not
// SSR-safe), and Suspense's own fallback was `null` too. Both of those
// null states used to expose <body>'s real background underneath —
// var(--background), a warm cream/brown in every theme (see
// globals.css) — for a visible beat on first paint, the "warm flash"
// even after IntroExperience's own bg-black media wrapper was fixed.
// This div is server-rendered immediately, painting black from the
// very first frame, before any client JS runs at all.
export default function OnboardingPage() {
  return (
    <div className="fixed inset-0 bg-black">
      <Suspense fallback={null}>
        <IntroExperience />
      </Suspense>
    </div>
  );
}
