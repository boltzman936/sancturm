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
 * useTheme/useColorMode's own comments) rendered as one coherent pill
 * — a single bordered container so the 4 swatches + mode button read
 * as one control group rather than five separate floating buttons.
 * Contrast is safe on any theme/mode since the sidebar's own
 * background is always the theme's dark anchor color (see
 * globals.css's own note: sidebar tokens don't flip with light/dark
 * mode), so sidebar-foreground/-border already guarantee contrast
 * here without any extra per-mode branching.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { mode, setMode } = useColorMode();

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-sidebar-border/70 bg-sidebar-foreground/[0.04] p-1"
      role="group"
      aria-label="Appearance"
    >
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Theme">
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
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full outline-none transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring",
              theme === id ? "ring-1 ring-sidebar-foreground/80 ring-offset-2 ring-offset-sidebar-background" : "opacity-80 hover:opacity-100"
            )}
          >
            <span
              className="h-3.5 w-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: SWATCH_STYLE[id] }}
            />
          </button>
        ))}
      </div>
      <div className="mx-0.5 h-4 w-px shrink-0 bg-sidebar-border/70" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sidebar-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:bg-sidebar-foreground/10 active:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
