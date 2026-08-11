"use client";

import { useBranches } from "@/features/branches/queries";
import { cn } from "@/lib/utils";

export function BranchSelectCard({
  onSelect,
  className,
}: {
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Reads from the `branches` table, not a hardcoded list — adding a
  // new branch/department is a database INSERT, nothing here needs to
  // change. IntroExperience prefetches this the moment the intro
  // starts, so by the time this card actually appears (after the
  // typing animation) the data is USUALLY already sitting in cache —
  // but "usually" isn't "always" (a slow or flaky connection can still
  // have this in flight), and rendering nothing but the header with no
  // loading or error state left a real visitor looking at an
  // apparently-broken, empty card with no way forward.
  const { data: branches, isLoading, isError, refetch } = useBranches();

  return (
    <div
      className={cn(
        // No backdrop-blur: with a playing video behind it, blur has to
        // be resampled by the GPU on every frame, not just once — that
        // was the actual source of the jank. A near-opaque solid
        // background gets the same dark-glass look for free.
        "w-full max-w-sm rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl",
        className
      )}
    >
      <h2 className="mb-4 text-center font-mono text-xs tracking-[0.08em] text-muted-foreground">
        select your branch
      </h2>
      {isLoading && (
        <div className="flex flex-col gap-2" aria-live="polite" aria-label="Loading branches">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[46px] animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="font-mono text-xs text-subtle-foreground">Couldn&apos;t load branches.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      )}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-2">
          {branches?.map((branch) => (
            <button
              key={branch.slug}
              onClick={() => onSelect(branch.slug)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-foreground transition-all duration-200 hover:border-primary active:border-primary hover:bg-white/10 active:bg-white/10 hover:shadow-[0_0_20px_rgba(255,74,45,0.15)] active:shadow-[0_0_20px_rgba(255,74,45,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {branch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
