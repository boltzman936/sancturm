"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useResetInvalidSelection } from "@/hooks/useResetInvalidSelection";
import { useBatchSemesterFilter, ALL_BATCHES } from "@/hooks/useBatchSemesterFilter";
import { useBranchBySlug } from "@/features/branches/queries";
import {
  useNotesAndLabResources,
  useSubjects,
  type ResourceWithSubject,
} from "@/features/resources/queries";
import { filterSubjectsForResourceType } from "@/features/resources/labSubjects";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { localDateKey, formatShortDate } from "@/lib/date";
import { matchesQuery } from "@/lib/search";
import { ordinalSemesterLabel } from "@/lib/termLabel";
import { sortByAcademicPriority } from "@/lib/sortByDate";
import { cn } from "@/lib/utils";
import type { ResourceType } from "@/features/resources/types";

type NotesOrLab = Extract<ResourceType, "notes" | "lab_manual">;
type DateSort = "newest" | "oldest";
const ALL_SUBJECTS = "all";
const EXTRA_SUBJECT = "extra";

// One search box, matched against title, description, and the date as
// displayed (so typing "Aug" or "2026" works the same as a title
// keyword) — a CR looking something up shouldn't need to know which
// field it's in.
function matchesSearch(resource: ResourceWithSubject, query: string) {
  return matchesQuery(
    [resource.title, resource.description, resource.subject?.name, formatShortDate(resource.created_at)],
    query
  );
}

export default function NotesAndLabPage() {
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);

  // Selected Batch determines academic progression; the sidebar's
  // "Switch year" is a ceiling on top of it, not an independent
  // filter — see useBatchSemesterFilter's own doc comment.
  const {
    allBatches,
    batchFilter,
    setBatchFilter,
    reachedTerms,
    effectiveTerm: term,
    liveCurrentTermId,
    setTermId,
  } = useBatchSemesterFilter();

  const [resourceType, setResourceType] = useState<NotesOrLab>("notes");
  const [dateSort, setDateSort] = useState<DateSort>("newest");
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL_SUBJECTS);
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [viewingResource, setViewingResource] = useState<ResourceWithSubject | null>(null);

  const { data: allSubjects } = useSubjects(branch?.id ?? null, term?.id ?? null);
  // The Subject filter's options depend on which tab is active — Lab
  // only ever applies to the subjects that actually have a lab
  // component, same restriction as the upload form. Notes excludes
  // the reverse case: a few subjects (Engineering Graphics, Soft
  // Skill) are lab-only and have no notes content at all.
  const subjectOptions = allSubjects ? filterSubjectsForResourceType(allSubjects, resourceType) : undefined;

  // A subject valid for "Notes" (e.g. Human Values) isn't a valid
  // filter once you switch to "Lab" — reset it right where resourceType
  // changes (the tab click below), rather than an effect just to
  // synchronize one state off another.
  function handleResourceTypeChange(type: NotesOrLab) {
    setResourceType(type);
    setSubjectFilter(ALL_SUBJECTS);
  }

  // Batch/Semester live in useBatchSemesterFilter (no local onChange to
  // extend here) — this catches a Subject that's no longer valid once
  // either of those change and resets it instead of silently showing
  // zero results.
  const validSubjectValues = useMemo(
    () => (subjectOptions ? [ALL_SUBJECTS, EXTRA_SUBJECT, ...subjectOptions.map((s) => s.id)] : undefined),
    [subjectOptions]
  );
  useResetInvalidSelection(subjectFilter, validSubjectValues, ALL_SUBJECTS, setSubjectFilter);

  const { data: resources, isLoading, isError } = useNotesAndLabResources(
    branch?.id ?? null,
    term?.id ?? null,
    resourceType
  );

  // Newest batch always groups first, regardless of dateSort direction
  // — built from the full batch catalog (Batch is independent of
  // Semester scoping now), not a new fetch.
  const batchStartYear = useMemo(() => new Map((allBatches ?? []).map((b) => [b.id, b.start_year])), [allBatches]);

  const filtered = useMemo(() => {
    const base = resources ?? [];
    const bySubject =
      subjectFilter === ALL_SUBJECTS
        ? base
        : subjectFilter === EXTRA_SUBJECT
          ? base.filter((resource) => !resource.subject)
          : base.filter((resource) => resource.subject?.id === subjectFilter);
    const byBatch =
      batchFilter === ALL_BATCHES ? bySubject : bySubject.filter((resource) => resource.batch_id === batchFilter);
    const byDate = dateFilter
      ? byBatch.filter((resource) => localDateKey(resource.created_at) === dateFilter)
      : byBatch;
    const bySearch = byDate.filter((resource) => matchesSearch(resource, searchQuery));
    return sortByAcademicPriority(bySearch, dateSort, batchStartYear);
  }, [resources, subjectFilter, batchFilter, dateFilter, searchQuery, dateSort, batchStartYear]);

  // `filtered` is already batch-grouped (batch is the primary sort key
  // above) — this just partitions the already-sorted list into
  // consecutive same-batch runs so each batch's resources can render
  // under its own "Batch 2026-27" heading, making the newest-batch-
  // first ordering visible instead of implicit.
  const groupedByBatch = useMemo(() => {
    const groups: { batchId: string | null; label: string; items: typeof filtered }[] = [];
    for (const resource of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.batchId === resource.batch_id) {
        last.items.push(resource);
      } else {
        const label = allBatches?.find((b) => b.id === resource.batch_id)?.label ?? "Other";
        groups.push({ batchId: resource.batch_id, label, items: [resource] });
      }
    }
    return groups;
  }, [filtered, allBatches]);

  // Semester needs more room than Batch (labels run up to "3rd
  // Semester (current)" vs. just "2025-26") — min-w floors each at
  // whatever its own longest realistic label needs, so text never
  // clips; flex-1 lets them share any extra row width beyond that
  // evenly, and both still shrink together (not stack) if the
  // viewport is genuinely too narrow to fit both at their minimums.
  const semesterSelect = () => (
    <Select
      value={term?.id ?? ""}
      onChange={(event) => setTermId(event.target.value)}
      className="min-w-[110px] sm:min-w-[260px] flex-1"
    >
      {reachedTerms.map((bt) => (
        <option key={bt.term_id} value={bt.term_id}>
          {ordinalSemesterLabel(bt.term.semester_number)}
          {bt.term_id === liveCurrentTermId ? " (current)" : ""}
        </option>
      ))}
    </Select>
  );

  const batchSelect = () => (
    <Select
      value={batchFilter}
      onChange={(event) => setBatchFilter(event.target.value)}
      className="min-w-[90px] sm:min-w-[150px] flex-1"
    >
      <option value={ALL_BATCHES}>All batches</option>
      {allBatches?.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {batch.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Notes & lab</h1>
        <p className="text-muted-foreground">
          Notes and lab manuals for {branch?.name ?? "your branch"}
          {batchFilter !== ALL_BATCHES && allBatches
            ? ` — ${allBatches.find((b) => b.id === batchFilter)?.label ?? ""}`
            : ""}
          {term ? `, ${term.label}` : ""}.
        </p>
      </div>

      {/* Desktop (lg+) — exact original layout, untouched. Duplicated
          rather than reflowed with responsive classes so the mobile/
          tablet redesign below can't accidentally affect it. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
        <div className="flex gap-1 rounded-md border border-border bg-card p-1">
          {(["notes", "lab_manual"] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleResourceTypeChange(type)}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                resourceType === type
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground active:text-foreground"
              )}
            >
              {type === "notes" ? "Notes" : "Lab"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["newest", "oldest"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setDateSort(option)}
                className={cn(
                  "rounded px-3 py-1.5 text-sm capitalize transition-colors",
                  dateSort === option
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <Select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="w-[190px] shrink-0"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </Select>

          {/* Semester + Batch, side by side — Semester first. Each has
              its own min-w floor sized to its longest realistic label
              (see semesterSelect/batchSelect), so text never clips;
              flex-1 shares any remaining row width between them. */}
          <div className="flex shrink-0 gap-2">
            {semesterSelect()}
            {batchSelect()}
          </div>
        </div>
      </div>

      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, subject, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <DateFilterInput value={dateFilter} onChange={setDateFilter} className="min-w-[160px]" />

        {dateFilter && (
          <button
            onClick={() => setDateFilter("")}
            className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
          >
            Clear date
          </button>
        )}
      </div>

      {/* Mobile/tablet (below lg) — grouped into one visually distinct
          "Filters" card: type+sort, then subject, then semester+batch,
          then search/date, each on their own row, instead of the
          desktop's wrapping flex row (which reflows unpredictably at
          narrow widths). */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 lg:hidden">
        <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Filters</h2>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["notes", "lab_manual"] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleResourceTypeChange(type)}
                className={cn(
                  "flex-1 rounded px-2 py-1.5 text-sm transition-colors",
                  resourceType === type
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {type === "notes" ? "Notes" : "Lab"}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["newest", "oldest"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setDateSort(option)}
                className={cn(
                  "flex-1 rounded px-2 py-1.5 text-sm capitalize transition-colors",
                  dateSort === option
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <Select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
          <option value={ALL_SUBJECTS}>All subjects</option>
          {subjectOptions?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
          <option value={EXTRA_SUBJECT}>Extra</option>
        </Select>

        {/* Semester + Batch side by side even on mobile — shrinks
            proportionally with the viewport rather than stacking. */}
        <div className="flex gap-2">
          {semesterSelect()}
          {batchSelect()}
        </div>

        <DateFilterInput value={dateFilter} onChange={setDateFilter} />

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, subject, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {dateFilter && (
          <button
            onClick={() => setDateFilter("")}
            className="self-start font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
          >
            Clear date
          </button>
        )}
      </div>

      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground lg:hidden">
        Resources
      </h2>

      {isLoading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Loading…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-8 text-center text-destructive">
          Couldn&apos;t load resources. Try refreshing.
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {resources && resources.length > 0 ? "No matches." : "Nothing here yet."}
        </div>
      )}

      {/* Grouped-with-headers only when "All batches" is in effect —
          the grouping is what's actually informative there (could span
          several batches). Once a specific batch is picked, `filtered`
          only ever contains that one batch anyway, so a "BATCH X"
          heading over every card would just repeat what the Batch
          filter above already says. */}
      {filtered.length > 0 && batchFilter === ALL_BATCHES && (
        <div className="flex flex-col gap-5">
          {groupedByBatch.map((group) => (
            <div key={group.batchId ?? "none"} className="flex flex-col gap-2">
              <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">
                BATCH {group.label.toUpperCase()}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} onView={setViewingResource} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && batchFilter !== ALL_BATCHES && (
        <ul className="flex flex-col gap-2">
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} onView={setViewingResource} />
          ))}
        </ul>
      )}

      <ResourceViewerDialog
        resource={viewingResource}
        open={viewingResource !== null}
        onOpenChange={(open) => {
          if (!open) setViewingResource(null);
        }}
      />
    </div>
  );
}
