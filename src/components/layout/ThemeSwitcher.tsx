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
    // -mt-2 pulls the pill up by exactly the height it gained over its
    // previous 36px size (buttons grew h-7 -> h-8, i.e. +4px more on
    // top of the +4px it already absorbed the same way last round), so
    // it keeps growing upward only — its bottom edge (and every
    // sibling below it, Dashboard/Sign out included) stays exactly
    // where it was.
    <div
      // Two-layer shadow (a tight near shadow + a softer, farther one)
      // reads as real elevation off the sidebar rather than a flat
      // outline — the classic "premium card" recipe — while staying
      // small enough not to read as a glow. The inset top highlight is
      // the other half of that: a hairline of light along the top
      // edge, like light catching a bevel, is what makes a bordered
      // pill read as a physical object instead of a flat rectangle.
      className="-mt-2 flex items-center gap-1 rounded-full border border-sidebar-border/70 bg-sidebar-foreground/[0.04] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.14),0_6px_14px_-8px_rgba(0,0,0,0.35)]"
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
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring",
              theme === id
                ? "scale-105 ring-[1.5px] ring-sidebar-foreground/85 ring-offset-2 ring-offset-sidebar-background"
                : "opacity-75 hover:scale-105 hover:opacity-100"
            )}
          >
            <span
              className="h-[18px] w-[18px] rounded-full border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_1px_1px_rgba(0,0,0,0.2)]"
              style={{ backgroundColor: SWATCH_STYLE[id] }}
            />
          </button>
        ))}
      </div>
      <div className="h-6 w-px shrink-0 bg-sidebar-border/70" aria-hidden="true" />
      {/* px-1.5/gap-1 (tighter than the swatch cluster's own spacing on
          purpose) — the icon+text pair together are wider than a
          single swatch, so this side needed to shed width somewhere to
          fit inside the sidebar's own narrower md/lg column widths
          (200/224px of content) without the pill itself growing wider
          than the sidebar. Pulling padding in here, not off the
          swatches or the container, keeps the 4 circles exactly where
          they were and keeps the whole pill's outer footprint governed
          by content instead of a fixed width — it just asks less
          horizontal room of this one section. */}
      <button
        type="button"
        onClick={() => setMode(mode === "dark" ? "light" : "dark")}
        aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full px-1.5 text-sidebar-muted-foreground outline-none transition-colors duration-200 ease-out hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:bg-sidebar-foreground/10 active:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {mode === "light" ? <Sun className="h-[18px] w-[18px] shrink-0" /> : <Moon className="h-[18px] w-[18px] shrink-0" />}
        <span className="text-xs font-medium leading-none">{mode === "light" ? "Light" : "Dark"}</span>
      </button>
    </div>
  );
}
