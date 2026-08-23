"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A plain <select> draws its own native chrome — dropdown arrow,
 * internal reserved padding for it — and how much space that chrome
 * takes up is NOT the same between browsers. Safari's default is
 * wider than Chrome's, so the exact same declared width (even a fixed
 * one) still rendered as a visibly different-sized control depending
 * on which browser was open. appearance-none strips all of that native
 * rendering out; this draws one manual chevron instead, so every
 * select looks byte-identical regardless of browser.
 *
 * Border/background live on the wrapper div, not the <select> itself
 * — same reasoning as DateFilterInput: the interactive element inside
 * stays visually "transparent" so nothing about its own native
 * rendering (which varies by browser) can affect the box's appearance.
 */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className={cn("relative rounded-md border border-border bg-card", className)}>
      {/* Tighter on mobile/tablet (py-1.5, smaller chevron) than
          desktop (sm:py-2) — every filter dropdown app-wide reads off
          this one component, so this single change is what compacts
          Notes/PYQ/Notices/Updates/Manage's filters everywhere at
          once, rather than six separate per-page adjustments. Options,
          values and onChange behavior are untouched — sizing only. */}
      <select
        {...props}
        className="w-full appearance-none bg-transparent px-2.5 py-1.5 pr-7 text-sm text-foreground outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-ring sm:px-3 sm:py-2 sm:pr-8"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle-foreground sm:right-3 sm:h-4 sm:w-4" />
    </div>
  );
}
