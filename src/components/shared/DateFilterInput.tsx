"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// A bare <input type="date"> renders fine on desktop Chrome/Safari,
// but on Android Chrome in a dark UI it can render as an essentially
// blank box — no visible "dd/mm/yyyy" placeholder, no visible calendar
// glyph, just an empty rounded rectangle with a chevron. This wraps it
// with our own always-visible calendar icon (same left-icon treatment
// as the search inputs next to it), so the field reads as "a date
// filter" regardless of how any given browser renders the native part.
export function DateFilterInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
      />
    </div>
  );
}
