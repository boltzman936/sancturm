"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/shared/Calendar";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string) {
  // T00:00:00 (not a bare yyyy-mm-dd) so this parses as local midnight,
  // not UTC midnight — the same local-date convention as localDateKey.
  return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A calendar date field — this used to wrap a native <input
 * type="date">, but that meant relying on the browser's own popup
 * calendar, which is drawn entirely outside the page by the OS/browser
 * and looks different in every browser with no way to override it via
 * CSS. Now backed by Calendar.tsx, a hand-built month grid in a Radix
 * popover — the whole thing is regular DOM this component owns, so it
 * renders identically everywhere.
 *
 * value/onChange still work in yyyy-mm-dd (or "" for none) — the same
 * contract as before, so every caller (Notes/PYQs/Notices/Manage
 * filters, the CR upload form's custom date) needed zero changes.
 */
export function DateFilterInput({
  value,
  onChange,
  className,
  placeholder = "Any date",
  minDate,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  // Passed straight through to Calendar — see its own comment. Every
  // caller except the CR upload form's custom-date field leaves this
  // unset.
  minDate?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleChange(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex w-full items-center gap-2 rounded-md border border-border bg-card py-2 pl-9 pr-3 text-left text-sm outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
            value ? "text-foreground" : "text-subtle-foreground",
            className
          )}
        >
          <CalendarIcon
            className={cn(
              "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
              value ? "text-primary" : "text-subtle-foreground"
            )}
          />
          {value ? formatDisplayDate(value) : placeholder}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          // Radix's own collision detection (on by default) is what
          // keeps this from ever overflowing the viewport or requiring
          // horizontal page scroll — it flips above the trigger, or
          // shifts sideways, whenever the default placement wouldn't
          // fit.
          collisionPadding={12}
          // The day grid focuses its own initial cell on open (see
          // Calendar's data-focused marker below) instead of Radix's
          // default of focusing the content wrapper itself — that's
          // what "focus should move appropriately into the calendar"
          // means here, not just focus landing somewhere inert.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget as HTMLElement;
            content.querySelector<HTMLElement>('[data-focused="true"]')?.focus();
          }}
          className="z-50 rounded-lg border border-border bg-card shadow-lg motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95"
        >
          <Calendar value={value} onChange={handleChange} minDate={minDate} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
