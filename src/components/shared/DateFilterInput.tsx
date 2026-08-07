"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// A bare <input type="date"> renders its empty-state placeholder
// ("dd/mm/yyyy") differently across browsers — invisible against a
// dark background on Android Chrome, but clearly visible on desktop
// Chrome/this preview's Chromium. Overlaying our own "Any date" label
// on top without hiding the native one caused the two to mash
// together ("Anld/date/yyyy") wherever the native text WAS visible.
// The fix: force the native datetime-edit text transparent whenever
// the field is empty, so our overlay is the only thing ever visibly
// rendered, everywhere — pointer-events-none on the overlay so taps
// still reach the real input underneath and open the native picker.
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
        className={cn(
          "w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark]",
          !value && "[&::-webkit-datetime-edit]:text-transparent"
        )}
      />
    </div>
  );
}
