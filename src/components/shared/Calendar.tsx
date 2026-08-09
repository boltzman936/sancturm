"use client";

import { useState } from "react";
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

function todayKey() {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * A hand-built month grid — not a wrapper around <input type="date">'s
 * native popup. That popup is drawn by the OS/browser, entirely
 * outside the page's DOM, so no amount of CSS can make Chrome's and
 * Safari's versions of it match — they're just genuinely different
 * native widgets. Owning every pixel here is the only way for the
 * calendar to look identical everywhere.
 *
 * Three views, not just the day grid: tapping the month or year in the
 * header jumps to a picker for that instead — reaching a date years
 * back used to mean clicking the prev-month arrow dozens of times,
 * which is exactly the complaint that prompted this. Every modern
 * calendar (Google Calendar, native pickers, ...) offers this same
 * shortcut for the same reason.
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
  const selected = value ? new Date(value + "T00:00:00") : null;
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? new Date().getMonth());
  const [view, setView] = useState<"days" | "months" | "years">("days");
  // The first year shown in the year grid — independent of viewYear so
  // paging the grid by a decade at a time doesn't itself change what
  // month/year is actually selected until a year is tapped.
  const [yearRangeStart, setYearRangeStart] = useState(
    () => viewYear - Math.floor(YEAR_GRID_SIZE / 2)
  );

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

  function openYearPicker() {
    setYearRangeStart(viewYear - Math.floor(YEAR_GRID_SIZE / 2));
    setView("years");
  }

  const today = todayKey();

  // ---- Month picker: tap a month, land back on the day grid ----
  if (view === "months") {
    return (
      <div className="w-[280px] p-3">
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            aria-label="Previous year"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openYearPicker}
            className="rounded-md px-2 py-1 font-mono text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
          >
            {viewYear}
          </button>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            aria-label="Next year"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {MONTH_SHORT_LABELS.map((label, index) => {
            const isSelected = index === viewMonth;
            const isCurrentMonth = viewYear === new Date().getFullYear() && index === new Date().getMonth();
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setViewMonth(index);
                  setView("days");
                }}
                className={cn(
                  "rounded-md py-2.5 text-sm transition-colors",
                  !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                  isSelected && "bg-primary text-primary-foreground",
                  isCurrentMonth && !isSelected && "text-primary"
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

  // ---- Year picker: tap a year, land back on the day grid ----
  if (view === "years") {
    const years = Array.from({ length: YEAR_GRID_SIZE }, (_, i) => yearRangeStart + i);
    const thisYear = new Date().getFullYear();
    return (
      <div className="w-[280px] p-3">
        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            onClick={() => setYearRangeStart((y) => y - YEAR_GRID_SIZE)}
            aria-label="Previous years"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
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
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
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
                className={cn(
                  "rounded-md py-2.5 text-sm transition-colors",
                  !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                  isSelected && "bg-primary text-primary-foreground",
                  year === thisYear && !isSelected && "text-primary"
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
    <div className="w-[280px] p-3">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={goToPrevMonth}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView("months")}
            className="rounded-md px-2 py-1 font-mono text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
          >
            {MONTH_LABELS[viewMonth]}
          </button>
          <button
            type="button"
            onClick={openYearPicker}
            className="rounded-md px-2 py-1 font-mono text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
          >
            {viewYear}
          </button>
        </div>
        <button
          type="button"
          onClick={goToNextMonth}
          aria-label="Next month"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground active:bg-background-secondary active:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center justify-center font-mono text-xs text-subtle-foreground"
          >
            {label}
          </div>
        ))}

        {cells.map((cell) => {
          const isSelected = cell.key === value;
          const isToday = cell.key === today;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onChange(cell.key)}
              className={cn(
                "flex h-8 w-8 items-center justify-center justify-self-center rounded-md text-sm transition-colors",
                !cell.inMonth && "text-subtle-foreground/40",
                cell.inMonth && !isSelected && "text-foreground hover:bg-background-secondary active:bg-background-secondary",
                isSelected && "bg-primary text-primary-foreground",
                isToday && !isSelected && "text-primary"
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onChange("")}
          className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onChange(today)}
          className="font-mono text-xs text-primary transition-colors hover:text-primary/80 active:text-primary/80"
        >
          Today
        </button>
      </div>
    </div>
  );
}
