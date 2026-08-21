import { cn } from "@/lib/utils";

// Fixed, theme-independent — the ONE piece of Sancturm UI that never
// changes with the active [data-theme]/[data-mode] (see globals.css's
// own header comment on why every other color in the app does). Per
// the brand spec: Deep Navy #0D2C4D + Secondary Warm Cream #F4EDE5 —
// no icon mark, just this text, so it needs ONE of the two colors
// picked per placement: navy reads on the cream/light brand ground,
// but is nearly unreadable on the sidebar chrome, which is a dark
// anchor color in all 4 themes (see globals.css's --sidebar-background
// per [data-theme]). `onDark` picks cream there instead. Still just
// the two fixed brand colors, never a theme token.
const WORDMARK_COLOR_LIGHT = "#0D2C4D";
const WORDMARK_COLOR_DARK = "#F4EDE5";

/**
 * The Sancturm wordmark — plain clickable text, no icon mark. Renders
 * in one of the two fixed brand colors regardless of the active theme
 * — see WORDMARK_COLOR_LIGHT/DARK's own comment for which, and when.
 */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={cn("font-sans text-lg font-semibold tracking-tight", className)}
      style={{ color: onDark ? WORDMARK_COLOR_DARK : WORDMARK_COLOR_LIGHT }}
    >
      sancturm
    </span>
  );
}
