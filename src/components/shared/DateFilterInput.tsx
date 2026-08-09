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
// 3. Safari-specific: text-transparent on ::-webkit-datetime-edit (and
//    even its individual sub-parts — ::-webkit-datetime-edit-text,
//    -month-field, -year-field, etc.) simply doesn't take effect in
//    Safari at all. Safari's support for styling these internals is
//    far more restricted than Chrome's — color tricks on the pseudo-
//    elements are a dead end there, no combination of selectors fixes
//    it. Fix: stop trying to recolor the native text and hide the
//    whole input instead (opacity-0, not display:none — it must stay
//    clickable/focusable for showPicker() and real typing to keep
//    working). Our own Calendar icon + "Any date" span, both rendered
//    independently on top, are the entire visual in the empty state;
//    the invisible input underneath is purely functional. Once
//    focused or filled, opacity goes back to 1 and the native
//    rendering (legible via [color-scheme:dark]) takes over normally —
//    same as before, just without depending on Safari's internals.
//    The border/background moved from the input to the wrapper div for
//    this reason too — opacity-0 on the input would otherwise also
//    erase the box outline itself while it's meant to stay visible.
export function DateFilterInput({
  value,
  onChange,
  className,
  placeholder = "Any date",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  // "Any date" reads right for a filter (this component's original
  // and still primary use); a field that SETS a date instead of
  // filtering by one — the CR upload form's optional custom date —
  // needs its own wording, so this is overridable rather than hardcoded.
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const showOverlay = !value && !focused;

  return (
    <div
      className={cn(
        "relative rounded-md border border-border bg-card",
        className
      )}
      onClick={() => inputRef.current?.showPicker?.()}
    >
      <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
      {showOverlay && (
        <span className="pointer-events-none absolute left-9 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">
          {placeholder}
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
          "w-full rounded-md bg-transparent py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:pointer-events-none [&::-webkit-calendar-picker-indicator]:opacity-0",
          showOverlay && "opacity-0"
        )}
      />
    </div>
  );
}
