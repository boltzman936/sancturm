"use client";

import { cn } from "@/lib/utils";

// Same three branches as everywhere else in the app (Sidebar,
// BranchSwitcher, and the database schema). Keeping this list in sync
// by hand across those three files is a small, accepted tradeoff for
// the MVP — see the architecture notes on why subjects/branches
// aren't fetched from the database yet.
const BRANCHES = [
  { slug: "cse-aiml", name: "CSE AIML" },
  { slug: "cse-core", name: "CSE Core" },
  { slug: "cse-aids", name: "CSE AIDS" },
];

export function BranchSelectCard({
  onSelect,
  className,
}: {
  onSelect: (slug: string) => void;
  className?: string;
}) {
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
      <div className="flex flex-col gap-2">
        {BRANCHES.map((branch) => (
          <button
            key={branch.slug}
            onClick={() => onSelect(branch.slug)}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-foreground transition-all duration-200 hover:border-primary hover:bg-white/10 hover:shadow-[0_0_20px_rgba(255,74,45,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {branch.name}
          </button>
        ))}
      </div>
    </div>
  );
}
