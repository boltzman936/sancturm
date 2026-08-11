"use client";

import { useTerms } from "@/features/terms/queries";
import { cn } from "@/lib/utils";

export function TermSelectCard({
  onSelect,
  className,
}: {
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Same reasoning as BranchSelectCard's identical change: no loading
  // or error fallback here meant a slow/flaky connection landed on an
  // empty card with just a header and no way forward.
  const { data: terms, isLoading, isError, refetch } = useTerms();

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl",
        className
      )}
    >
      <h2 className="mb-4 text-center font-mono text-xs tracking-[0.08em] text-muted-foreground">
        select your year
      </h2>
      {isLoading && (
        <div className="flex flex-col gap-2" aria-live="polite" aria-label="Loading years">
          {[0, 1].map((i) => (
            <div key={i} className="h-[46px] animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="font-mono text-xs text-subtle-foreground">Couldn&apos;t load years.</p>
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
          {terms?.map((term) => (
            <button
              key={term.slug}
              onClick={() => onSelect(term.slug)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-foreground transition-all duration-200 hover:border-primary active:border-primary hover:bg-white/10 active:bg-white/10 hover:shadow-[0_0_20px_rgba(255,74,45,0.15)] active:shadow-[0_0_20px_rgba(255,74,45,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* Shown as just "1st Year" — sem isn't asked separately
                  since each year currently maps to exactly one semester
                  (Sem 2/4 come later once these cohorts progress). */}
              {term.label.split(" - ")[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
