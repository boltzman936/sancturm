"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * Wraps the whole app so any Client Component can use TanStack Query
 * hooks (useQuery, useMutation) — e.g. features/resources/queries.ts.
 *
 * The QueryClient is created inside useState rather than as a plain
 * module-level variable. This matters in Next.js specifically: if it
 * were a module-level variable, every visitor on the server would
 * share the SAME cache, leaking one student's data into another's
 * request. useState guarantees each browser session gets its own.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The default (0) treats every cached result as stale
            // immediately, so switching between pages/tabs re-fetched
            // and re-showed a loading spinner even for data fetched a
            // second ago. One minute is long enough to kill that
            // re-navigation flicker; individual queries can still set
            // their own shorter staleTime where freshness matters more.
            staleTime: 60_000,
            // TanStack's own default is 3 retries with exponential
            // backoff (up to a 30s cap per attempt) — on a genuinely
            // slow/lossy connection, a query that's actually going to
            // fail sits retrying for many extra seconds before the UI
            // can show an error, which just reads as "stuck loading"
            // for far longer than any one request's real timeout. 2
            // retries with a capped 5s backoff still absorbs a normal
            // transient blip without dragging out a real failure.
            retry: 2,
            retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 5_000),
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Floating devtools icon, dev-only — safe to leave in, it's
          automatically stripped from production builds. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
