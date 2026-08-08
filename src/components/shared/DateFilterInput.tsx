"use client";

import { useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// A bare <input type="date"> renders its empty-state placeholder
// ("dd/mm/yyyy") differently across browsers — invisible against a
// dark background on Android Chrome, visible elsewhere. Two problems
// came from the first two fixes at this:
//
// 1. Making the native text permanently transparent whenever the
//    field was empty also hid it while ACTIVELY FOCUSED and editing —
//    Chrome renders the currently-selected date segment (e.g. "dd")
//    with its own highlight that ignores color:transparent, so that
//    segment stayed visible and collided with our "Any date" overlay
//    sitting on top of it. Fix: only fake-hide the native text (and
//    show the overlay) while the field is both empty AND NOT focused —
//    once focused, hand rendering back to the native input, which
//    [color-scheme:dark] already renders legibly.
// 2. Our own Calendar icon plus the browser's native picker-indicator
//    icon showed up side by side — two calendar glyphs in one field.
//    Fix: hide the native indicator entirely and make the whole box
//    open the picker via showPicker(), so there's only ever one icon.
export function DateFilterInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const showOverlay = !value && !focused;

  return (
    <div
      className={cn("relative", className)}
      onClick={() => inputRef.current?.showPicker?.()}
    >
      <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
      {showOverlay && (
        <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">
          Any date
        </span>
      )}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={cn(
          "w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0",
          showOverlay && "[&::-webkit-datetime-edit]:text-transparent"
        )}
      />
    </div>
  );
}
