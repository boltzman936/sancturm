"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useResetInvalidSelection } from "@/hooks/useResetInvalidSelection";
import { useSessionPersistedState } from "@/hooks/useSessionPersistedState";
import { useBatchSemesterFilter, ALL_BATCHES, ALL_SEMESTERS } from "@/hooks/useBatchSemesterFilter";
import { useBranchBySlug, useSpecializations } from "@/features/branches/queries";
import {
  usePyqResources,
  useSubjectsForPyqScope,
  useSubjectsForPyqScopeTerms,
  type ResourceWithSubject,
} from "@/features/resources/queries";
import { useHistoricalSharedResources, mergeHistoricalSharedResources } from "@/features/resources/historicalSharing";
import { useCanonicalPyqResources, mergeCanonicalPyqResources } from "@/features/resources/centralizedPyq";
import { pyqSharingSpecializationIds } from "@/features/resources/pyqSharing";
import { LAB_ONLY_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { ResourceCard } from "@/features/resources/components/ResourceCard";
import { ResourceListSkeleton } from "@/features/resources/components/ResourceListSkeleton";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { localDateKey, formatShortDate } from "@/lib/date";
import { matchesQuery } from "@/lib/search";
import { ordinalSemesterLabel, ordinalYearLabel } from "@/lib/termLabel";
import { sortByAcademicPriority } from "@/lib/sortByDate";
import { cn } from "@/lib/utils";
import type { ResourceType } from "@/features/resources/types";

type PyqKind = Extract<ResourceType, "pyq" | "pyq_solution">;
type DateSort = "newest" | "oldest";
const ALL_SUBJECTS = "all";
const EXTRA_SUBJECT = "extra";

function matchesSearch(resource: ResourceWithSubject, query: string) {
  return matchesQuery(
    [resource.title, resource.description, resource.subject?.name, formatShortDate(resource.created_at)],
    query
  );
}

export default function PYQsPage() {
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);
  const { specialization: specializationSlug, clearSpecialization } = useSpecialization();
  const { data: branchSpecializations } = useSpecializations(branch?.has_specializations ? branch.id : null);

  // A stale specialization slug would otherwise silently zero out
  // pyqSpecializationIds below (pyqSharingSpecializationIds returns []
  // for an unrecognized slug — see its own comment), which disables
  // usePyqResources entirely with no error or loading state — the page
  // just renders "nothing here" indefinitely even though real PYQs
  // exist. Same fix as Notes & Lab's identical guard; see its comment
  // for why null itself is left alone.
  const validSpecializationSlugs = useMemo(() => {
    if (!branch?.has_specializations || !branchSpecializations) return undefined;
    return [null, ...branchSpecializations.map((s) => s.slug)];
  }, [branch, branchSpecializations]);
  useResetInvalidSelection(specializationSlug, validSpecializationSlugs, null, clearSpecialization);

  // Selected Batch + sidebar Year jointly determine which semesters
  // exist — see useBatchSemesterFilter's own doc comment (shared with
  // Notes & Lab). eligibleBatches drives the Batch <select>'s options.
  const {
    allBatches,
    eligibleBatches,
    hasNoReachedBatches,
    batchFilter,
    setBatchFilter,
    reachedTerms,
    isLoadingReachedTerms,
    hideSemesterFilter,
    effectiveTerm: term,
    effectiveTermId,
    effectiveTermIds,
    yearNumber,
    liveCurrentTermId,
    setTermId,
  } = useBatchSemesterFilter();
  const isAllSemesters = effectiveTermId === ALL_SEMESTERS;
  const specializationName = branchSpecializations?.find((s) => s.slug === specializationSlug)?.name;

  // Which specializations WITHIN this viewer's own branch actually
  // pool together — 1st Year splits Core+AIML from AIDS, 2nd Year
  // stays shared across all three; Cyber Security never pools with any
  // of them (see pyqSharing.ts). Never crosses a different real
  // branch — a Civil student never sees a CSE PYQ. The sharing rule is
  // per-Year, not per-Semester, so yearNumber (not term.year_number) is
  // what this needs — it stays defined even under "All semesters",
  // where there's no single term to read a year_number off of. Empty
  // for a branch with no specialization concept — usePyqResources
  // treats that as "match specialization_id is null" instead.
  const pyqSpecializationIds = useMemo(() => {
    if (yearNumber === undefined || !branch?.has_specializations || !branchSpecializations || !specializationSlug) {
      return [];
    }
    return pyqSharingSpecializationIds(yearNumber, specializationSlug, branchSpecializations);
  }, [yearNumber, branch, branchSpecializations, specializationSlug]);

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
  // Persisted for the session (see useSessionPersistedState) so an
  // explicit pick survives a route change instead of resetting on
  // remount — same bug class as useBatchSemesterFilter's termId.
  const [subjectFilter, setSubjectFilter] = useSessionPersistedState<string>(
    "sancturm:subjectFilter:pyqs",
    ALL_SUBJECTS
  );
  const [searchQuery, setSearchQuery] = useState("");
  // See Notes' own identical comment — the input stays bound to
  // searchQuery for instant keystroke feedback, filtering reads this
  // deferred copy so it never blocks typing.
  const deferredSearchQuery = useDeferredValue(searchQuery);
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [viewingResource, setViewingResource] = useState<ResourceWithSubject | null>(null);

  // Every subject in the viewer's own branch/sharing-pool scope for
  // this term — already scoped by useSubjectsForPyqScope to exactly
  // the same (branch, specializations) set usePyqResources itself
  // queries, so the dropdown never offers a subject whose PYQs this
  // viewer can't actually see. Deduped by name (same subject exists as
  // a separate row per specialization) and lab-only subjects excluded,
  // same as Notes — a PYQ is never for a subject with no theory
  // component. Under "All semesters", union across every semester in
  // view instead of just one (both hooks always called, per rules of
  // hooks — whichever doesn't apply gets empty/null args and is a
  // no-op).
  const { data: singleTermSubjects } = useSubjectsForPyqScope(
    branch?.id ?? null,
    pyqSpecializationIds,
    branch?.has_specializations ?? false,
    isAllSemesters ? null : term?.id ?? null
  );
  const { data: multiTermSubjects } = useSubjectsForPyqScopeTerms(
    branch?.id ?? null,
    pyqSpecializationIds,
    branch?.has_specializations ?? false,
    isAllSemesters ? effectiveTermIds : []
  );
  const allTermSubjects = isAllSemesters ? multiTermSubjects : singleTermSubjects;
  const subjectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const subject of allTermSubjects ?? []) {
      if (!LAB_ONLY_SUBJECT_SLUGS.has(subject.slug)) names.add(subject.name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allTermSubjects]);

  const { data: ownResources, isLoading, isError } = usePyqResources(
    branch?.id ?? null,
    pyqSpecializationIds,
    branch?.has_specializations ?? false,
    isAllSemesters ? effectiveTermIds : term?.id ?? null
  );

  // 2025-26's own 1st Year (Sem 1 + Sem 2) pools PYQs/Solutions across
  // every branch/specialization by canonical subject identity — see
  // historicalSharing.ts's own header comment. usePyqResources fetches
  // both resource_type "pyq" and "pyq_solution" together (kind is
  // filtered client-side, see `filtered` below), so both are fetched
  // here the same way and concatenated before merging.
  const batchFilterIsAllOrHistorical =
    batchFilter === ALL_BATCHES || allBatches?.find((b) => b.id === batchFilter)?.label === "2025-26";
  const { data: sharedPyq } = useHistoricalSharedResources({
    localSubjects: allTermSubjects,
    section: "pyq",
    resourceType: "pyq",
    yearNumber,
    batchFilterIsAllOrHistorical,
  });
  const { data: sharedPyqSolution } = useHistoricalSharedResources({
    localSubjects: allTermSubjects,
    section: "pyq",
    resourceType: "pyq_solution",
    yearNumber,
    batchFilterIsAllOrHistorical,
  });
  const sharedResources = useMemo(
    () => [...(sharedPyq ?? []), ...(sharedPyqSolution ?? [])],
    [sharedPyq, sharedPyqSolution]
  );
  const legacyResources = useMemo(
    () => mergeHistoricalSharedResources(ownResources, sharedResources, allTermSubjects),
    [ownResources, sharedResources, allTermSubjects]
  );

  // Centralized PYQs (any batch/year, not just the 2025-26/Year-1
  // legacy exception above) — see centralizedPyq.ts. Own-branch
  // uploads of a centralized PYQ already come back through
  // ownResources too (branch_id still matches); mergeCanonicalPyqResources
  // dedupes by id so that row shows exactly once either way.
  const { data: canonicalPyq } = useCanonicalPyqResources({ localSubjects: allTermSubjects, resourceType: "pyq" });
  const { data: canonicalPyqSolution } = useCanonicalPyqResources({
    localSubjects: allTermSubjects,
    resourceType: "pyq_solution",
  });
  const resources = useMemo(
    () => mergeCanonicalPyqResources([legacyResources, canonicalPyq, canonicalPyqSolution], allTermSubjects),
    [legacyResources, canonicalPyq, canonicalPyqSolution, allTermSubjects]
  );

  // Resets subjectFilter same as Notes & Lab's tab switch — a subject
  // selected while looking at solutions shouldn't silently carry over
  // and look like it's still filtering once back on papers.
  function handlePyqKindChange(kind: PyqKind) {
    setPyqKind(kind);
    setSubjectFilter(ALL_SUBJECTS);
  }

  // Batch/Semester live in useBatchSemesterFilter (no local onChange to
  // extend here) — this catches a Subject name that's no longer valid
  // for the new branch/sharing group and resets it. Gated on
  // allTermSubjects itself (undefined = still loading), not just
  // subjectOptions (which is always a real, if possibly still-empty,
  // array) — matching Notes & Lab's identical guard. Without this, a
  // persisted Subject pick (see useSessionPersistedState) gets wiped
  // the instant this page mounts: on the very first render
  // subjectOptions is legitimately still `[]` because the query hasn't
  // resolved yet, and useResetInvalidSelection has no way to tell that
  // apart from "this subject genuinely isn't valid here" unless it's
  // told to wait.
  const validSubjectValues = useMemo(
    () => (allTermSubjects ? [ALL_SUBJECTS, EXTRA_SUBJECT, ...subjectOptions] : undefined),
    [allTermSubjects, subjectOptions]
  );
  useResetInvalidSelection(subjectFilter, validSubjectValues, ALL_SUBJECTS, setSubjectFilter);

  // Newest batch always groups first, regardless of dateSort direction
  // — built from the full batch catalog (Batch is independent of
  // Semester scoping now), not a new fetch.
  const batchStartYear = useMemo(() => new Map((allBatches ?? []).map((b) => [b.id, b.start_year])), [allBatches]);

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
    const bySearch = byDate.filter((resource) => matchesSearch(resource, deferredSearchQuery));
    return sortByAcademicPriority(bySearch, dateSort, batchStartYear);
  }, [resources, pyqKind, subjectFilter, batchFilter, dateFilter, deferredSearchQuery, dateSort, batchStartYear]);

  // Same batch-group partitioning as Notes & Lab — see its identical
  // comment for why this is a cheap partition, not a re-sort.
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

  // Describes whichever sharing pool actually applies right now — 1st
  // Year genuinely isn't "every CSE specialization" anymore (AIDS has
  // its own separate PYQs there, and Cyber Security never pools with
  // any of them), so this can't be a fixed string.
  const sharingDescription = useMemo(() => {
    if (!branch?.has_specializations) return "shared across your branch";
    if (yearNumber === undefined || !branchSpecializations) return "shared across your specialization";
    const names = branchSpecializations
      .filter((s) => pyqSpecializationIds.includes(s.id))
      .map((s) => s.name);
    return names.length > 1 ? `shared between ${names.join(" and ")}` : "separate from other specializations";
  }, [yearNumber, branch, branchSpecializations, pyqSpecializationIds]);

  // Semester needs more room than Batch (labels run up to "3rd
  // Semester (current)" vs. just "2025-26") — min-w floors each at
  // whatever its own longest realistic label needs, so text never
  // clips; flex-1 shares any extra row width between them.
  const semesterSelect = () => (
    <Select value={effectiveTermId} onChange={(event) => setTermId(event.target.value)} className="min-w-[110px] sm:min-w-[260px] flex-1">
      {/* See Notes & Lab's identical comment on semesterSelect — avoids
          the <select> rendering blank for the one render where a Batch
          switch has cleared reachedTerms but the new batch's terms
          haven't arrived yet. */}
      {isLoadingReachedTerms && <option value="">Loading…</option>}
      {/* Only offered under "All batches" — see Notes & Lab's
          identical comment on semesterSelect. */}
      {batchFilter === ALL_BATCHES && <option value={ALL_SEMESTERS}>All semesters</option>}
      {reachedTerms.map((bt) => (
        <option key={bt.term_id} value={bt.term_id}>
          {ordinalSemesterLabel(bt.term.semester_number)}
          {bt.term_id === liveCurrentTermId ? " (current)" : ""}
        </option>
      ))}
    </Select>
  );

  const batchSelect = () => (
    <Select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)} className="min-w-[90px] sm:min-w-[150px] flex-1">
      {(eligibleBatches?.length ?? 0) > 1 && <option value={ALL_BATCHES}>All batches</option>}
      {eligibleBatches?.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {batch.label}
        </option>
      ))}
    </Select>
  );

  // Same reasoning as Notes & Lab's identical check — a real (branch,
  // specialization) with zero batches reached for this Year (e.g.
  // Cyber Security has no 2025-26 cohort), shown instead of a filter
  // bar whose Batch <select> would render blank.
  if (!isLoadingReachedTerms && hasNoReachedBatches) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PYQs</h1>
          <p className="text-muted-foreground">
            Previous year questions for {specializationName ?? branch?.name ?? "your branch"}.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {specializationName ?? branch?.name ?? "This branch"} hasn&apos;t reached{" "}
          {yearNumber !== undefined ? ordinalYearLabel(yearNumber) : "this year"} yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">PYQs</h1>
        <p className="text-muted-foreground">
          Previous year questions — {sharingDescription}
          {batchFilter !== ALL_BATCHES && allBatches
            ? ` in ${allBatches.find((b) => b.id === batchFilter)?.label ?? ""}`
            : ""}
          {isAllSemesters
            ? `${batchFilter !== ALL_BATCHES ? "," : " in"} ${reachedTerms[0]?.term.label.split(" - ")[0] ?? ""} - All Semesters`
            : term
              ? `${batchFilter !== ALL_BATCHES ? "," : " in"} ${term.label}`
              : " this term"}
          .
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
                    ? "bg-primary text-primary-foreground shadow-sm"
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
                  "flex-1 min-w-0 rounded px-3 py-1.5 text-center text-sm capitalize transition-colors",
                  dateSort === option
                    ? "bg-primary text-primary-foreground shadow-sm"
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

          {/* Semester + Batch, side by side — Semester first, matching
              Notes & Lab's identical layout (see its comment on why
              each has its own min-w floor instead of a shared fixed
              width, and on hideSemesterFilter below). */}
          <div className="flex shrink-0 gap-2">
            {!hideSemesterFilter && semesterSelect()}
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
                    ? "bg-primary text-primary-foreground shadow-sm"
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
                  "flex-1 min-w-0 rounded px-2 py-1.5 text-center text-sm capitalize transition-colors",
                  dateSort === option
                    ? "bg-primary text-primary-foreground shadow-sm"
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
          {subjectOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={EXTRA_SUBJECT}>Extra</option>
        </Select>

        {/* Semester + Batch side by side even on mobile — shrinks
            proportionally with the viewport rather than stacking.
            Semester hidden entirely where it isn't a useful filter
            (see hideSemesterFilter) — no empty gap left behind. */}
        <div className="flex gap-2">
          {!hideSemesterFilter && semesterSelect()}
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
        {pyqKind === "pyq" ? "PYQs" : "Solutions"}
      </h2>

      {(isLoading || isLoadingReachedTerms) && <ResourceListSkeleton />}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-8 text-center text-destructive">
          Couldn&apos;t load resources. Try refreshing.
        </div>
      )}

      {!isLoading && !isLoadingReachedTerms && !isError && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {resources && resources.length > 0 ? "No matches." : "Nothing here yet."}
        </div>
      )}

      {/* Grouped-with-headers only when "All batches" is in effect —
          see Notes & Lab's identical comment for why a specific batch
          selection shows a plain flat list instead. */}
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
