"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT_LABELS = MONTH_LABELS.map((m) => m.slice(0, 3));
// How many years show at once in the year picker — arranging 12 in a
// 3x4 grid keeps the popover the same size as the day grid above it.
const YEAR_GRID_SIZE = 12;

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// T00:00:00 (not a bare yyyy-mm-dd) so this parses as local midnight,
// not UTC midnight — a date key built from and parsed back through
// this pair never drifts a day in either direction regardless of the
// viewer's timezone.
function parseDateKey(key: string): Date {
  return new Date(key + "T00:00:00");
}

function todayKey() {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

// Everything below operates on real Date arithmetic (setDate/setMonth
// rolling over naturally into the next/previous month or year), never
// on hardcoded day-count tables — that's what makes leap years,
// December → January, and every other month-length edge case correct
// for free instead of needing special-cased handling.
function addDays(key: string, delta: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + delta);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function addMonths(key: string, delta: number): string {
  const d = parseDateKey(key);
  const day = d.getDate();
  // Pinned to the 1st before adding months — adding a month directly
  // to e.g. Jan 31 would otherwise overflow into March (Feb has no
  // 31st), which setDate silently "corrects" by rolling forward
  // instead of clamping. Re-applying the original day afterward,
  // clamped to whatever the new month actually has, is what keeps
  // "one month from Jan 31" landing on Feb 28/29 instead of Mar 2/3.
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  const daysInNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInNewMonth));
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function addYears(key: string, delta: number): string {
  return addMonths(key, delta * 12);
}

function startOfWeek(key: string): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() - d.getDay());
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfWeek(key: string): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + (6 - d.getDay()));
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatFullDate(key: string): string {
  return parseDateKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Shared by every nav arrow (prev/next month, prev/next year, prev/
// next year-range) — one 36px (touch-friendly) icon button style
// instead of three near-identical class strings.
const NAV_BUTTON_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A hand-built month grid — not a wrapper around <input type="date">'s
 * native popup. That popup is drawn by the OS/browser, entirely
 * outside the page's DOM, so no amount of CSS can make Chrome's and
 * Safari's versions of it match — they're just genuinely different
 * native widgets. Owning every pixel here is the only way for the
 * calendar to look identical everywhere.
 *
 * Three views: tapping "August 2026" in the day view's header jumps
 * to a month grid for the year; tapping the year there jumps to a
 * compact year-range grid. Selecting a year lands back on the month
 * grid for it, selecting a month lands back on the day grid for it —
 * reaching a date years back is three taps, never dozens of prev-
 * month clicks.
 *
 * Full roving-tabindex keyboard support in the day grid: arrow keys
 * move by day/week, Home/End jump to the start/end of the focused
 * week, PageUp/PageDown step a month, Shift+PageUp/PageDown step a
 * year, Enter/Space selects. Escape and outside clicks are handled by
 * the Radix Popover this renders inside (see DateFilterInput), not
 * here.
 *
 * value/onChange both work in yyyy-mm-dd (or "" for none) — the exact
 * same contract <input type="date"> already had, so nothing calling
 * this needs its own date math.
 */
export function Calendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value ? parseDateKey(value) : null;
  const today = todayKey();
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? new Date().getMonth());
  const [view, setView] = useState<"days" | "months" | "years">("days");
  // The first year shown in the year grid — independent of viewYear so
  // paging the grid by a dozen years at a time doesn't itself change
  // what month/year is actually selected until a year is tapped.
  const [yearRangeStart, setYearRangeStart] = useState(
    () => viewYear - Math.floor(YEAR_GRID_SIZE / 2)
  );
  // Roving keyboard focus within the day grid — independent of `value`
  // (the actual selection) so arrow-key browsing doesn't select
  // anything until Enter/Space, exactly like a native picker.
  const [focusedKey, setFocusedKey] = useState(() => value || today);
  const dayButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldMoveFocusRef = useRef(false);

  useEffect(() => {
    if (!shouldMoveFocusRef.current) return;
    shouldMoveFocusRef.current = false;
    dayButtonRefs.current.get(focusedKey)?.focus();
  }, [focusedKey, viewMonth, viewYear, view]);

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function openMonthPicker() {
    setView("months");
  }

  function openYearPicker() {
    setYearRangeStart(viewYear - Math.floor(YEAR_GRID_SIZE / 2));
    setView("years");
  }

  function moveFocus(nextKey: string) {
    const d = parseDateKey(nextKey);
    setFocusedKey(nextKey);
    if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
    }
    shouldMoveFocusRef.current = true;
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(addDays(focusedKey, -1));
        return;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(addDays(focusedKey, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(addDays(focusedKey, -7));
        return;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(addDays(focusedKey, 7));
        return;
      case "Home":
        event.preventDefault();
        moveFocus(startOfWeek(focusedKey));
        return;
      case "End":
        event.preventDefault();
        moveFocus(endOfWeek(focusedKey));
        return;
      case "PageUp":
        event.preventDefault();
        moveFocus(event.shiftKey ? addYears(focusedKey, -1) : addMonths(focusedKey, -1));
        return;
      case "PageDown":
        event.preventDefault();
        moveFocus(event.shiftKey ? addYears(focusedKey, 1) : addMonths(focusedKey, 1));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onChange(focusedKey);
        return;
      default:
        // Escape (closes the popover) and Tab both fall through
        // untouched — handled by Radix Popover, not this grid.
        return;
    }
  }

  // ---- Month picker: tap a month, land back on the day grid ----
  if (view === "months") {
    const isCurrentYear = viewYear === new Date().getFullYear();
    return (
      <div className="w-[320px] p-4">
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="Previous year"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openYearPicker}
            className="rounded-md px-3 py-1.5 font-mono text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {viewYear}
          </button>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            aria-label="Next year"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTH_SHORT_LABELS.map((label, index) => {
            const isSelected = index === viewMonth;
            const isCurrentMonth = isCurrentYear && index === new Date().getMonth();
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setViewMonth(index);
                  setView("days");
                  shouldMoveFocusRef.current = true;
                }}
                aria-label={`${MONTH_LABELS[index]} ${viewYear}`}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-md py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                  isSelected && "bg-primary text-primary-foreground",
                  isCurrentMonth && !isSelected && "font-medium text-primary"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Year picker: tap a year, land back on the month grid ----
  if (view === "years") {
    const years = Array.from({ length: YEAR_GRID_SIZE }, (_, i) => yearRangeStart + i);
    const thisYear = new Date().getFullYear();
    return (
      <div className="w-[320px] p-4">
        <div className="flex items-center justify-between pb-3">
          <button
            type="button"
            onClick={() => setYearRangeStart((y) => y - YEAR_GRID_SIZE)}
            aria-label="Previous years"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-mono text-sm text-foreground">
            {years[0]} – {years[years.length - 1]}
          </span>
          <button
            type="button"
            onClick={() => setYearRangeStart((y) => y + YEAR_GRID_SIZE)}
            aria-label="Next years"
            className={NAV_BUTTON_CLASS}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {years.map((year) => {
            const isSelected = year === viewYear;
            return (
              <button
                key={year}
                type="button"
                onClick={() => {
                  setViewYear(year);
                  setView("months");
                }}
                aria-label={String(year)}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-md py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                  isSelected && "bg-primary text-primary-foreground",
                  year === thisYear && !isSelected && "font-medium text-primary"
                )}
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Day grid (default view) ----
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  // Native Date arithmetic, not a hardcoded days-per-month table —
  // day 0 of the FOLLOWING month is the last day of THIS one, and
  // Date itself already knows February has 28 or 29 depending on the
  // year, so leap years fall out for free.
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Always a fixed 6-row grid — a fluctuating 4-6 rows depending on
  // the month would shift the popover's height (and anything below
  // it) every time you navigate, which reads as janky.
  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + i + 1;
    const month = viewMonth === 0 ? 11 : viewMonth - 1;
    const year = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ key: toDateKey(year, month, day), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: toDateKey(viewYear, viewMonth, day), day, inMonth: true });
  }
  while (cells.length < 42) {
    const day = cells.length - (startOffset + daysInMonth) + 1;
    const month = viewMonth === 11 ? 0 : viewMonth + 1;
    const year = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ key: toDateKey(year, month, day), day, inMonth: false });
  }

  return (
    <div className="w-[320px] p-4">
      <div className="flex items-center justify-between pb-3">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className={NAV_BUTTON_CLASS}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={openMonthPicker}
          className="rounded-md px-3 py-1.5 font-mono text-sm font-medium text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {MONTH_LABELS[viewMonth]} {viewYear}
        </button>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Next month"
          className={NAV_BUTTON_CLASS}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1" role="grid" onKeyDown={handleGridKeyDown}>
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center justify-center font-mono text-[11px] tracking-wide text-subtle-foreground"
            aria-hidden="true"
          >
            {label}
          </div>
        ))}

        {cells.map((cell) => {
          const isSelected = cell.key === value;
          const isToday = cell.key === today;
          const isFocusable = cell.key === focusedKey;
          return (
            <button
              key={cell.key}
              ref={(el) => {
                if (el) dayButtonRefs.current.set(cell.key, el);
                else dayButtonRefs.current.delete(cell.key);
              }}
              type="button"
              tabIndex={isFocusable ? 0 : -1}
              data-focused={isFocusable ? "true" : undefined}
              onClick={() => {
                setFocusedKey(cell.key);
                onChange(cell.key);
              }}
              onFocus={() => setFocusedKey(cell.key)}
              aria-label={formatFullDate(cell.key)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center justify-self-center rounded-full text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !cell.inMonth && "text-subtle-foreground/30",
                cell.inMonth && !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                isSelected && "bg-primary font-medium text-primary-foreground",
                isToday && !isSelected && "font-medium text-primary"
              )}
            >
              {cell.day}
              {isToday && !isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-1 w-1 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear selected date"
          className="rounded-md px-2 py-1.5 font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onChange(today)}
          aria-label="Select today"
          className="rounded-md px-2 py-1.5 font-mono text-xs text-primary transition-colors hover:text-primary/80 active:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Today
        </button>
      </div>
    </div>
  );
}
