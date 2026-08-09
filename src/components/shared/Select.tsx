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
      <select
        {...props}
        className="w-full appearance-none bg-transparent px-3 py-2 pr-8 text-sm text-foreground outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
    </div>
  );
}
