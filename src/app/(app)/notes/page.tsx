"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useBranchBySlug } from "@/features/branches/queries";
import {
  useNotesAndLabResources,
  useSubjects,
  type ResourceWithSubject,
} from "@/features/resources/queries";
import { LAB_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { localDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { ResourceType } from "@/features/resources/types";

type NotesOrLab = Extract<ResourceType, "notes" | "lab_manual">;
type DateSort = "newest" | "oldest";
const ALL_SUBJECTS = "all";
const EXTRA_SUBJECT = "extra";

function sortByDate(resources: ResourceWithSubject[], order: DateSort) {
  const sorted = [...resources];
  sorted.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return order === "newest" ? diff : -diff;
  });
  return sorted;
}

function formatSearchableDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// One search box, matched against title, description, and the date as
// displayed (so typing "Aug" or "2026" works the same as a title
// keyword) — a CR looking something up shouldn't need to know which
// field it's in.
function matchesSearch(resource: ResourceWithSubject, query: string) {
  if (!query.trim()) return true;
  const haystack = [
    resource.title,
    resource.description ?? "",
    resource.subject?.name ?? "",
    formatSearchableDate(resource.created_at),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export default function NotesAndLabPage() {
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);

  const [resourceType, setResourceType] = useState<NotesOrLab>("notes");
  const [dateSort, setDateSort] = useState<DateSort>("newest");
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL_SUBJECTS);
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [viewingResource, setViewingResource] = useState<ResourceWithSubject | null>(null);

  const { data: allSubjects } = useSubjects(branch?.id ?? null);
  // The Subject filter's options depend on which tab is active — Lab
  // only ever applies to the subjects that actually have a lab
  // component, same restriction as the upload form.
  const subjectOptions =
    resourceType === "lab_manual"
      ? allSubjects?.filter((subject) => LAB_SUBJECT_SLUGS.has(subject.slug))
      : allSubjects;

  // A subject valid for "Notes" (e.g. Human Values) isn't a valid
  // filter once you switch to "Lab" — reset it right where resourceType
  // changes (the tab click below), rather than an effect just to
  // synchronize one state off another.
  function handleResourceTypeChange(type: NotesOrLab) {
    setResourceType(type);
    setSubjectFilter(ALL_SUBJECTS);
  }

  const { data: resources, isLoading, isError } = useNotesAndLabResources(
    branch?.id ?? null,
    resourceType
  );

  const filtered = useMemo(() => {
    const base = resources ?? [];
    const bySubject =
      subjectFilter === ALL_SUBJECTS
        ? base
        : subjectFilter === EXTRA_SUBJECT
          ? base.filter((resource) => !resource.subject)
          : base.filter((resource) => resource.subject?.id === subjectFilter);
    const byDate = dateFilter
      ? bySubject.filter((resource) => localDateKey(resource.created_at) === dateFilter)
      : bySubject;
    const bySearch = byDate.filter((resource) => matchesSearch(resource, searchQuery));
    return sortByDate(bySearch, dateSort);
  }, [resources, subjectFilter, dateFilter, searchQuery, dateSort]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Notes & lab</h1>
        <p className="text-muted-foreground">
          Notes and lab manuals for {branch?.name ?? "your branch"}.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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

          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

      {filtered.length > 0 && (
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
