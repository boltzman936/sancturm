import { Suspense } from "react";
import { SupportSancturmPanel } from "@/features/support/components/SupportSancturmPanel";

export default function SupportPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      {/* useSearchParams() (reading a future payment redirect's
          ?status=...) requires a Suspense boundary in the App Router —
          the fallback only ever shows for the instant it takes to read
          the URL, not a real loading state (that's handled inside the
          panel itself via useSupportConfig's isLoading). */}
      <Suspense fallback={null}>
        <SupportSancturmPanel />
      </Suspense>
    </div>
  );
}
