"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// A bare <input type="date"> renders fine on desktop Chrome/Safari,
// but on Android Chrome in a dark UI its empty-state placeholder text
// ("dd/mm/yyyy") renders in a color that's effectively invisible
// against a dark background — the calendar icon alone wasn't enough,
// the field still LOOKED blank/broken. This overlays our own visible
// "Any date" label on top of the native input whenever it's empty,
// pointer-events-none so taps still reach the real input underneath
// and open the native picker; once a value is chosen the overlay
// disappears and the native (usually correctly colored) value shows.
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
      <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
      {!value && (
        <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">
          Any date
        </span>
      )}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]"
      />
    </div>
  );
}
