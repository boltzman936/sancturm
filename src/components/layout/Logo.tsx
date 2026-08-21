import { cn } from "@/lib/utils";

/**
 * The Sancturm wordmark — plain clickable text, no icon mark. Color
 * comes from whichever surface it's actually sitting on, not a fixed
 * hex: `surface="sidebar"` uses --sidebar-foreground (already tuned
 * per theme for contrast against --sidebar-background, which is a
 * dark anchor color in all 4 themes — see globals.css), `surface=
 * "content"` uses plain --foreground (already tuned per theme AND
 * light/dark mode against --background). Both are real design tokens,
 * already relied on everywhere else in the app for exactly this
 * "always readable against its own background" property — this reuses
 * that instead of hardcoding a color that would need to be re-verified
 * by hand every time a theme or mode is added.
 */
export function Logo({
  className,
  surface = "content",
}: {
  className?: string;
  surface?: "sidebar" | "content";
}) {
  return (
    <span
      className={cn(
        "font-sans text-lg font-semibold tracking-tight",
        surface === "sidebar" ? "text-sidebar-foreground" : "text-foreground",
        className
      )}
    >
      sancturm
    </span>
  );
}
