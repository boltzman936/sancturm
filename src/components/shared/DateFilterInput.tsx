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
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
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
            "relative flex w-full items-center gap-2 rounded-md border border-border bg-card py-2 pl-9 pr-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value ? "text-foreground" : "text-subtle-foreground",
            className
          )}
        >
          <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          {value ? formatDisplayDate(value) : placeholder}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-md border border-border bg-card shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <Calendar value={value} onChange={handleChange} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
