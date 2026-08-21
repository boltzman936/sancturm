"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme, THEME_IDS, THEME_LABELS, type ThemeId } from "@/hooks/useTheme";
import { useColorMode } from "@/hooks/useColorMode";
import { cn } from "@/lib/utils";

// One swatch per theme, colored from its own [data-theme] sidebar
// anchor — a plain CSS var reference (not Tailwind's --color-* theme
// utilities, since those always resolve to whichever theme is
// CURRENTLY active on <html>, not the one this specific swatch
// represents) using the same var(--sidebar-background, N) pattern
// globals.css defines per [data-theme="N"] block.
const SWATCH_STYLE: Record<ThemeId, string> = {
  "1": "#799dce",
  "2": "#c95d2a",
  "3": "#013e37",
  "4": "#5e4074",
};

/**
 * Sidebar's theme + light/dark controls. Two independent axes (see
 * useTheme/useColorMode's own comments) rendered as one compact
 * cluster: 4 swatches pick the palette, one icon button flips mode.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { mode, setMode } = useColorMode();

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Theme">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={theme === id}
            aria-label={THEME_LABELS[id]}
            title={THEME_LABELS[id]}
            onClick={() => setTheme(id)}
            className={cn(
              "h-5 w-5 shrink-0 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
              theme === id ? "scale-110 ring-2 ring-sidebar-foreground/70 ring-offset-1 ring-offset-sidebar-background" : "hover:scale-105"
            )}
            style={{ backgroundColor: SWATCH_STYLE[id] }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="rounded-md p-1.5 text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:bg-sidebar-foreground/10 active:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
