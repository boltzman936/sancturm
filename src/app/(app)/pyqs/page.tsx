"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useTerm } from "@/hooks/useTerm";
import { useResetInvalidSelection } from "@/hooks/useResetInvalidSelection";
import { useBranchBySlug, useBranches } from "@/features/branches/queries";
import { useTermBySlug, useTerms } from "@/features/terms/queries";
import { usePyqResources, useSubjectsForTerm, type ResourceWithSubject } from "@/features/resources/queries";
import { pyqSharingBranchNames } from "@/features/resources/pyqSharing";
import { LAB_ONLY_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { useBatch } from "@/hooks/useBatch";
import { useBatchesForTerm } from "@/features/batches/queries";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { localDateKey, formatShortDate } from "@/lib/date";
import { matchesQuery } from "@/lib/search";
import { sortByAcademicPriority } from "@/lib/sortByDate";
import { cn } from "@/lib/utils";
import type { ResourceType } from "@/features/resources/types";

type PyqKind = Extract<ResourceType, "pyq" | "pyq_solution">;
type DateSort = "newest" | "oldest";
const ALL_SUBJECTS = "all";
const EXTRA_SUBJECT = "extra";
// Same reasoning as Notes & Lab's identical constant — defaults to
// every batch, an additive narrowing filter rather than one that
// hides content by default.
const ALL_BATCHES = "all";

function matchesSearch(resource: ResourceWithSubject, query: string) {
  return matchesQuery(
    [resource.title, resource.description, resource.subject?.name, formatShortDate(resource.created_at)],
    query
  );
}

// Relative to the year, not the absolute semester_number — a 2nd-Year
// student should see "1st Semester"/"2nd Semester" (their own two),
// not "3rd Semester"/"4th Semester" (the absolute numbering used
// internally to keep every academic_terms row unique).
function ordinalSemesterLabel(indexInYear: number) {
  return indexInYear === 0 ? "1st Semester" : indexInYear === 1 ? "2nd Semester" : `${indexInYear + 1}th Semester`;
}

export default function PYQsPage() {
  const { term: termSlug } = useTerm();
  // The sidebar's coarse, always-resolves-to-current identity — stays
  // completely untouched. `term` below is what everything downstream
  // actually uses, and can be overridden to any semester within the
  // same year via the Semester filter (see semesterOptions).
  const { data: sidebarTerm } = useTermBySlug(termSlug);
  const { data: allTerms } = useTerms();
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);
  const { data: allBranches } = useBranches();

  // Every semester belonging to the sidebar-resolved year — lets a
  // student browse a semester that isn't CURRENTLY active (e.g. this
  // year's own Sem 1, months after it ended) without touching the
  // sidebar's own "pick your year" identity at all.
  const semesterOptions = useMemo(() => {
    if (!sidebarTerm || !allTerms) return [];
    return allTerms
      .filter((t) => t.year_number === sidebarTerm.year_number)
      .sort((a, b) => a.semester_number - b.semester_number);
  }, [sidebarTerm, allTerms]);

  // null = defer to the sidebar-resolved (current) term. Session-local,
  // not persisted — same as Subject/Type/Date, unlike Branch/Year/Batch.
  const [semesterTermId, setSemesterTermId] = useState<string | null>(null);
  const validSemesterIds = useMemo(
    () => (semesterOptions.length ? [null, ...semesterOptions.map((t) => t.id)] : undefined),
    [semesterOptions]
  );
  // Branch/Year are global (sidebar switchers) — no local onChange to
  // extend, so this catches a semester pick that no longer belongs to
  // the sidebar's year (Year changed) and defers back to current.
  useResetInvalidSelection(semesterTermId, validSemesterIds, null, setSemesterTermId);

  const term = semesterTermId ? allTerms?.find((t) => t.id === semesterTermId) : sidebarTerm;
  // Which branches' PYQs this viewer actually sees together — 1st Year
  // splits Core+AIML from AIDS, 2nd Year stays shared across all
  // three (see pyqSharing.ts). Resolved to real branch ids once both
  // the term and the full branch list are loaded; usePyqResources
  // itself won't fire its query until this is non-null, so there's no
  // window where it fetches unscoped.
  const allowedBranchIds = useMemo(() => {
    if (!term || !branch || !allBranches) return null;
    const names = pyqSharingBranchNames(term.year_number, branch.name);
    return allBranches.filter((b) => names.includes(b.name)).map((b) => b.id);
  }, [term, branch, allBranches]);

  // Paper vs. worked solution — the PYQ equivalent of Notes & Lab's
  // Notes/Lab toggle, same pattern: one section, two resource_type
  // values, filtered client-side rather than refetched, since PYQs for
  // a whole term are already fetched in one request either way.
  const [pyqKind, setPyqKind] = useState<PyqKind>("pyq");
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

  const { data: resources, isLoading, isError } = usePyqResources(term?.id ?? null, allowedBranchIds);
  // Every batch's PYQs are already in `resources` (batchId omitted
  // from the query above) — filtered client-side below, same reasoning
  // as Notes & Lab's identical comment. Scoped to the current term,
  // same reasoning as Notes & Lab's Batch picker.
  const { batch: batchLabel, setBatch } = useBatch();
  const { data: batches } = useBatchesForTerm(term?.id ?? null);
  const batchFilter = useMemo(() => {
    if (!batchLabel || batchLabel === ALL_BATCHES) return ALL_BATCHES;
    return batches?.find((b) => b.label === batchLabel)?.id ?? ALL_BATCHES;
  }, [batchLabel, batches]);
  function handleBatchFilterChange(id: string) {
    if (id === ALL_BATCHES) {
      setBatch(ALL_BATCHES);
      return;
    }
    const picked = batches?.find((b) => b.id === id);
    if (picked) setBatch(picked.label);
  }
  // Every branch's subjects for this term, not just the viewer's own
  // branch — a branch's subject list (e.g. AIDS's, which is entirely
  // different from AIML/Core's for 1st Year) doesn't cover every
  // subject a PYQ might exist under, since PYQs are shared across
  // every branch WITHIN the viewer's own sharing group. Deduped by
  // name (same subject exists as a separate row per branch) and
  // lab-only subjects excluded, same as Notes — a PYQ is never for a
  // subject with no theory component.
  const { data: allTermSubjects } = useSubjectsForTerm(term?.id ?? null);
  const subjectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const subject of allTermSubjects ?? []) {
      // Scoped to the same sharing group usePyqResources itself
      // fetches — without this, the dropdown would offer subject
      // names (e.g. AIDS-only ones) whose PYQs this viewer can no
      // longer actually see.
      if (allowedBranchIds && !allowedBranchIds.includes(subject.branch_id)) continue;
      if (!LAB_ONLY_SUBJECT_SLUGS.has(subject.slug)) names.add(subject.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allTermSubjects, allowedBranchIds]);

  // Resets subjectFilter same as Notes & Lab's tab switch — a subject
  // selected while looking at solutions shouldn't silently carry over
  // and look like it's still filtering once back on papers.
  function handlePyqKindChange(kind: PyqKind) {
    setPyqKind(kind);
    setSubjectFilter(ALL_SUBJECTS);
  }

  // Branch/Year are global (sidebar switchers) — no local onChange to
  // extend, so this catches a Subject name that's no longer valid for
  // the new branch/year's sharing group and resets it.
  const validSubjectValues = useMemo(
    () => [ALL_SUBJECTS, EXTRA_SUBJECT, ...subjectOptions],
    [subjectOptions]
  );
  useResetInvalidSelection(subjectFilter, validSubjectValues, ALL_SUBJECTS, setSubjectFilter);

  // Newest batch always groups first, regardless of dateSort direction —
  // built from the same term-scoped batches list already fetched above
  // for the Batch filter, not a new fetch.
  const batchStartYear = useMemo(() => new Map((batches ?? []).map((b) => [b.id, b.start_year])), [batches]);

  const filtered = useMemo(() => {
    // Legacy 'pdf' rows (pre-dating the pyq/pyq_solution split) count
    // as a question paper — without this they're invisible here even
    // though Manage still shows and labels them as "PYQ".
    const base = (resources ?? []).filter((resource) =>
      pyqKind === "pyq" ? resource.resource_type === "pyq" || resource.resource_type === "pdf" : resource.resource_type === pyqKind
    );
    const bySubject =
      subjectFilter === ALL_SUBJECTS
        ? base
        : subjectFilter === EXTRA_SUBJECT
          ? base.filter((resource) => !resource.subject)
          : base.filter((resource) => resource.subject?.name === subjectFilter);
    const byBatch =
      batchFilter === ALL_BATCHES ? bySubject : bySubject.filter((resource) => resource.batch_id === batchFilter);
    const byDate = dateFilter
      ? byBatch.filter((resource) => localDateKey(resource.created_at) === dateFilter)
      : byBatch;
    const bySearch = byDate.filter((resource) => matchesSearch(resource, searchQuery));
    return sortByAcademicPriority(bySearch, dateSort, batchStartYear);
  }, [resources, pyqKind, subjectFilter, batchFilter, dateFilter, searchQuery, dateSort, batchStartYear]);

  // Same batch-group partitioning as Notes & Lab, always shown — see
  // its identical comment for why this is a cheap partition, not a
  // re-sort.
  const groupedByBatch = useMemo(() => {
    const groups: { batchId: string | null; label: string; items: typeof filtered }[] = [];
    for (const resource of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.batchId === resource.batch_id) {
        last.items.push(resource);
      } else {
        const label = batches?.find((b) => b.id === resource.batch_id)?.label ?? "Other";
        groups.push({ batchId: resource.batch_id, label, items: [resource] });
      }
    }
    return groups;
  }, [filtered, batches]);

  // Describes whichever sharing group actually applies right now —
  // 1st Year genuinely isn't "every CSE branch" anymore (AIDS has its
  // own separate PYQs there), so this can't be a fixed string.
  const sharingDescription = useMemo(() => {
    if (!term || !branch) return "shared across your branch";
    const names = pyqSharingBranchNames(term.year_number, branch.name);
    return names.length > 1 ? `shared between ${names.join(" and ")}` : "separate from other branches";
  }, [term, branch]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">PYQs</h1>
        <p className="text-muted-foreground">
          Previous year questions — {sharingDescription}
          {term ? ` in ${term.label}` : " this term"}.
        </p>
      </div>

      {/* Desktop (lg+) — exact original layout, untouched. Duplicated
          rather than reflowed with responsive classes so the mobile/
          tablet redesign below can't accidentally affect it. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["pyq", "pyq_solution"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => handlePyqKindChange(kind)}
                className={cn(
                  "rounded px-3 py-1.5 text-sm transition-colors",
                  pyqKind === kind
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {kind === "pyq" ? "PYQ" : "Solution"}
              </button>
            ))}
          </div>

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
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={term?.id ?? ""}
            onChange={(event) => setSemesterTermId(event.target.value)}
            className="w-[170px] shrink-0"
          >
            {semesterOptions.map((t, index) => (
              <option key={t.id} value={t.id}>
                {ordinalSemesterLabel(index)}
                {t.id === sidebarTerm?.id ? " (current)" : ""}
              </option>
            ))}
          </Select>

          <Select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="w-[190px] shrink-0"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </Select>

          <Select
            value={batchFilter}
            onChange={(event) => handleBatchFilterChange(event.target.value)}
            className="w-[150px] shrink-0"
          >
            <option value={ALL_BATCHES}>All batches</option>
            {batches?.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.label}
              </option>
            ))}
          </Select>
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

        <div className="grid grid-cols-2 gap-2">
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {(["pyq", "pyq_solution"] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => handlePyqKindChange(kind)}
                className={cn(
                  "flex-1 rounded px-2 py-1.5 text-sm transition-colors",
                  pyqKind === kind
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {kind === "pyq" ? "PYQ" : "Solution"}
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

        <Select value={term?.id ?? ""} onChange={(event) => setSemesterTermId(event.target.value)}>
          {semesterOptions.map((t, index) => (
            <option key={t.id} value={t.id}>
              {ordinalSemesterLabel(index)}
              {t.id === sidebarTerm?.id ? " (current)" : ""}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="min-w-0"
          >
            <option value={ALL_SUBJECTS}>All subjects</option>
            {subjectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={EXTRA_SUBJECT}>Extra</option>
          </Select>

          <Select value={batchFilter} onChange={(event) => handleBatchFilterChange(event.target.value)} className="min-w-0">
            <option value={ALL_BATCHES}>All batches</option>
            {batches?.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.label}
              </option>
            ))}
          </Select>
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
        {pyqKind === "pyq" ? "PYQs" : "Solutions"}
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
