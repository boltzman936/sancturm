import { cn } from "@/lib/utils";

// Fixed, theme-independent — the ONE piece of Sancturm UI that never
// changes with the active [data-theme]/[data-mode] (see globals.css's
// own header comment on why every other color in the app does). Per
// the brand spec: Deep Navy #0D2C4D + Secondary Warm Cream #F4EDE5,
// baked directly into public/brand/logo-mark.svg's own fill attributes
// (not CSS vars) for exactly this reason — no theme's tokens should
// ever be able to recolor it, even by accident.
const WORDMARK_COLOR = "#0D2C4D";

/**
 * The Sancturm mark: the provided icon SVG + "sancturm" wordmark text,
 * laid out as one clickable-height lockup. Icon and text both render
 * in the fixed brand navy regardless of the active theme — see
 * WORDMARK_COLOR's own comment.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small
          static brand asset, not a content image; next/image's
          optimization pipeline (resizing/format negotiation) buys
          nothing here and adds a request-shape mismatch risk for an
          SVG this size. */}
      <img src="/brand/logo-mark.svg" alt="" aria-hidden="true" className="h-full w-auto" />
      <span className="font-sans text-lg font-semibold tracking-tight" style={{ color: WORDMARK_COLOR }}>
        sancturm
      </span>
    </span>
  );
}
