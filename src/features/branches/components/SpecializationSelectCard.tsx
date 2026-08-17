"use client";

import { useSpecializations } from "@/features/branches/queries";
import { cn } from "@/lib/utils";

export function SpecializationSelectCard({
  branchId,
  onSelect,
  className,
}: {
  branchId: string;
  onSelect: (slug: string) => void;
  className?: string;
}) {
  // Same reasoning as BranchSelectCard's own useBranches() call — reads
  // from the `specializations` table, not a hardcoded list, so a new
  // CSE specialization shows up here with zero code change.
  const { data: specializations, isLoading, isError, refetch } = useSpecializations(branchId);

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl",
        className
      )}
    >
      <h2 className="mb-4 text-center font-mono text-xs tracking-[0.08em] text-muted-foreground">
        select your specialization
      </h2>
      {isLoading && (
        <div className="flex flex-col gap-2" aria-live="polite" aria-label="Loading specializations">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[46px] animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="font-mono text-xs text-subtle-foreground">Couldn&apos;t load specializations.</p>
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
          {specializations?.map((specialization) => (
            <button
              key={specialization.slug}
              onClick={() => onSelect(specialization.slug)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-foreground transition-all duration-200 hover:border-primary active:border-primary hover:bg-white/10 active:bg-white/10 hover:shadow-[0_0_20px_rgba(255,74,45,0.15)] active:shadow-[0_0_20px_rgba(255,74,45,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {specialization.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
