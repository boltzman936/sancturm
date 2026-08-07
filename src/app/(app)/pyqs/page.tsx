"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useBranchBySlug } from "@/features/branches/queries";
import {
  usePyqResources,
  useSubjects,
  type ResourceWithSubject,
} from "@/features/resources/queries";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
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
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);

  const [dateSort, setDateSort] = useState<DateSort>("newest");
  // Subject filter is matched by NAME, not id — PYQs span every
  // branch, and each branch has its own subject row (a different id)
  // for the same-named subject. Matching by name is what makes "DSA"
  // mean the same thing regardless of which branch's PYQ it's on.
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL_SUBJECTS);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingResource, setViewingResource] = useState<ResourceWithSubject | null>(null);

  const { data: subjectOptions } = useSubjects(branch?.id ?? null);
  const { data: resources, isLoading, isError } = usePyqResources();

  const filtered = useMemo(() => {
    const base = resources ?? [];
    const bySubject =
      subjectFilter === ALL_SUBJECTS
        ? base
        : subjectFilter === EXTRA_SUBJECT
          ? base.filter((resource) => !resource.subject)
          : base.filter((resource) => resource.subject?.name === subjectFilter);
    const bySearch = bySubject.filter((resource) => matchesSearch(resource, searchQuery));
    return sortByDate(bySearch, dateSort);
  }, [resources, subjectFilter, searchQuery, dateSort]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">PYQs</h1>
        <p className="text-muted-foreground">
          Previous year questions — shared across every CSE branch this term.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions?.map((subject) => (
              <option key={subject.id} value={subject.name}>
                {subject.name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </select>
        </div>
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
