"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

// Next's App Router error boundary for everything under (app) — a
// client-side render exception anywhere in Notes/PYQs/Notices/etc.
// used to crash straight to Next's own unstyled overlay (dev) or a
// blank page (production), with no way back except a manual reload
// that loses whatever filters/scroll state was set. This catches it
// in place: same route, same URL, a real "Try again" that re-renders
// just the failed segment via reset() — no navigation, so a filter
// pick or Batch/Semester selection made before the crash survives.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side detail stays server-side (Next strips the message
    // for production client bundles unless NEXT_PUBLIC-prefixed); this
    // is just enough to correlate a report with a server log via the
    // digest, never a raw stack trace shown to the user.
    console.error("Route error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-foreground">Something went wrong</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          This page hit an unexpected error. Your filters and selection are still here — try again.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90"
      >
        Try again
      </button>
      {error.digest && (
        <p className="font-mono text-[10px] text-subtle-foreground">Reference: {error.digest}</p>
      )}
    </div>
  );
}
