import { cn } from "@/lib/utils";

// Shared shimmer placeholder — reuses globals.css's own .animate-shimmer
// keyframe (already relied on by SelectCard/SupportSancturmPanel) so
// every loading state in the app sweeps at the same speed instead of
// each screen inventing its own. Theme-token based (border/card), not
// hardcoded white, so it reads correctly across all 4 themes x 2 modes.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-md bg-border/60 bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent_25%,var(--card)_50%,transparent_75%)]",
        className
      )}
    />
  );
}
