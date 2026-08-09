"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTerm } from "@/hooks/useTerm";
import { useTermBySlug } from "@/features/terms/queries";
import { usePyqResources, useSubjectsForTerm, type ResourceWithSubject } from "@/features/resources/queries";
import { LAB_ONLY_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { localDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";

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

export default function PYQsPage() {
  const { term: termSlug } = useTerm();
  const { data: term } = useTermBySlug(termSlug);

  const [dateSort, setDateSort] = useState<DateSort>("newest");
  // Subject filter is matched by NAME, not id — PYQs span every
  // branch, and each branch has its own subject row (a different id)
  // for the same-named subject. Matching by name is what makes "DSA"
  // mean the same thing regardless of which branch's PYQ it's on.
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL_SUBJECTS);
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [viewingResource, setViewingResource] = useState<ResourceWithSubject | null>(null);

  const { data: resources, isLoading, isError } = usePyqResources(term?.id ?? null);
  // Every branch's subjects for this term, not just the viewer's own
  // branch — a branch's subject list (e.g. AIDS's, which is entirely
  // different from AIML/Core's for 1st Year) doesn't cover every
  // subject a PYQ might exist under, since PYQs are shared across
  // every branch in the term. Deduped by name (same subject exists as
  // a separate row per branch) and lab-only subjects excluded, same
  // as Notes — a PYQ is never for a subject with no theory component.
  const { data: allTermSubjects } = useSubjectsForTerm(term?.id ?? null);
  const subjectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const subject of allTermSubjects ?? []) {
      if (!LAB_ONLY_SUBJECT_SLUGS.has(subject.slug)) names.add(subject.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allTermSubjects]);

  const filtered = useMemo(() => {
    const base = resources ?? [];
    const bySubject =
      subjectFilter === ALL_SUBJECTS
        ? base
        : subjectFilter === EXTRA_SUBJECT
          ? base.filter((resource) => !resource.subject)
          : base.filter((resource) => resource.subject?.name === subjectFilter);
    const byDate = dateFilter
      ? bySubject.filter((resource) => localDateKey(resource.created_at) === dateFilter)
      : bySubject;
    const bySearch = byDate.filter((resource) => matchesSearch(resource, searchQuery));
    return sortByDate(bySearch, dateSort);
  }, [resources, subjectFilter, dateFilter, searchQuery, dateSort]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">PYQs</h1>
        <p className="text-muted-foreground">
          Previous year questions — shared across every CSE branch
          {term ? ` in ${term.label.split(" - ")[0]}` : " this term"}.
        </p>
      </div>

      {/* Desktop (lg+) — exact original layout, untouched. Duplicated
          rather than reflowed with responsive classes so the mobile/
          tablet redesign below can't accidentally affect it. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
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

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="w-[190px] shrink-0 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </select>
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
          "Filters" card, same pattern as the Notes & Lab page. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 lg:hidden">
        <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Filters</h2>

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

        <div className="grid grid-cols-2 gap-2">
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </select>

          <DateFilterInput value={dateFilter} onChange={setDateFilter} />
        </div>

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
        PYQs
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
