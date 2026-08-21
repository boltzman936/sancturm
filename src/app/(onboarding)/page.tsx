import { Suspense } from "react";
import { IntroExperience } from "@/features/branches/components/IntroExperience";

// Suspense boundary required by IntroExperience's own useSearchParams()
// call (reads ?cockpit=1 — see its own comment) — without it, Next
// can't statically prerender this page at all and the build fails
// outright, not just warns.
export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <IntroExperience />
    </Suspense>
  );
}
