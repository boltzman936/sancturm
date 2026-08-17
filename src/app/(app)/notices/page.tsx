"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Pin, Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBatchSemesterFilter, ALL_BATCHES, ALL_SEMESTERS } from "@/hooks/useBatchSemesterFilter";
import { useBranchBySlug, useSpecializations } from "@/features/branches/queries";
import { useNotices } from "@/features/notices/queries";
import { toggleNoticePin } from "@/features/notices/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import type { Notice } from "@/features/notices/types";
import { localDateKey, formatShortDate } from "@/lib/date";
import { ordinalSemesterLabel } from "@/lib/termLabel";
import { sortByPinnedThenDate, type DateSortOrder } from "@/lib/sortByDate";
import { cn, downloadFile } from "@/lib/utils";

function matchesSearch(notice: Notice, query: string) {
  if (!query.trim()) return true;
  const haystack = [notice.title, notice.body ?? "", formatShortDate(notice.created_at)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

// View-only — publishing happens from the CR dashboard's Upload flow,
// removal happens from Manage. This page just shows what's live.
export default function NoticesPage() {
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);
  const { specialization: specializationSlug } = useSpecialization();
  const { data: branchSpecializations } = useSpecializations(branch?.has_specializations ? branch.id : null);
  const specializationId = branch?.has_specializations
    ? branchSpecializations?.find((s) => s.slug === specializationSlug)?.id ?? null
    : null;

  // Same Batch-primary, date-gated Semester resolution Notes & Lab and
  // PYQs already use — a notice posted for a SPECIFIC semester (not
  // just whichever one the sidebar's Year switcher currently resolves
  // to) is genuinely reachable/browsable here, not just correctly
  // scoped in the query underneath.
  const {
    allBatches,
    eligibleBatches,
    batchFilter,
    setBatchFilter,
    reachedTerms,
    isLoadingReachedTerms,
    hideSemesterFilter,
    effectiveTerm: term,
    effectiveTermId,
    effectiveTermIds,
    liveCurrentTermId,
    setTermId,
  } = useBatchSemesterFilter();
  const isAllSemesters = effectiveTermId === ALL_SEMESTERS;

  const { data: notices, isLoading, isError } = useNotices(
    branch?.id ?? null,
    specializationId,
    branch?.has_specializations ?? false,
    isAllSemesters ? effectiveTermIds : term?.id ?? null,
    batchFilter !== ALL_BATCHES ? batchFilter : null
  );
  const { data: role } = useCurrentRole();
  const queryClient = useQueryClient();

  // A CR can browse another (branch, specialization, term)'s notices
  // like a normal student (no manage powers there) — pinning only
  // works on their own scope, same as everything else in the CR
  // permission model. Never true under "All semesters" (no single
  // term to match against), same as it'd correctly fail server-side.
  const canManage =
    role?.type === "admin" ||
    (role?.type === "cr" &&
      role.branchId === branch?.id &&
      role.specializationId === specializationId &&
      role.termId === term?.id);

  async function handleTogglePin(notice: Notice) {
    await toggleNoticePin(notice.id, !notice.is_pinned);
    queryClient.invalidateQueries({ queryKey: ["notices"] });
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [dateSort, setDateSort] = useState<DateSortOrder>("newest");
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);

  const filtered = useMemo(() => {
    const base = notices ?? [];
    const byDate = dateFilter
      ? base.filter((notice) => localDateKey(notice.created_at) === dateFilter)
      : base;
    const bySearch = byDate.filter((notice) => matchesSearch(notice, searchQuery));
    return sortByPinnedThenDate(bySearch, dateSort);
  }, [notices, dateFilter, searchQuery, dateSort]);

  // Same min-w-floored, side-by-side Semester+Batch pair as Notes &
  // Lab / PYQs — see their identical comment for why each gets its own
  // floor instead of a shared fixed width.
  const semesterSelect = () => (
    <Select
      value={effectiveTermId}
      onChange={(event) => setTermId(event.target.value)}
      className="min-w-[110px] sm:min-w-[260px] flex-1"
    >
      {isLoadingReachedTerms && <option value="">Loading…</option>}
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
    <Select
      value={batchFilter}
      onChange={(event) => setBatchFilter(event.target.value)}
      className="min-w-[90px] sm:min-w-[150px] flex-1"
    >
      {(eligibleBatches?.length ?? 0) > 1 && <option value={ALL_BATCHES}>All batches</option>}
      {eligibleBatches?.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {batch.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Notices</h1>
        <p className="text-muted-foreground">
          Official PDFs for {branch?.name ?? "your branch"}
          {batchFilter !== ALL_BATCHES && allBatches
            ? ` — ${allBatches.find((b) => b.id === batchFilter)?.label ?? ""}`
            : ""}
          {isAllSemesters
            ? `, ${reachedTerms[0]?.term.label.split(" - ")[0] ?? ""} - All Semesters`
            : term
              ? `, ${term.label}`
              : ""}
          .
        </p>
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

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {/* Semester + Batch, side by side — Semester first, matching
            Notes & Lab / PYQs' identical layout. Semester hidden
            entirely where it isn't a useful filter (see
            hideSemesterFilter). */}
        <div className="flex shrink-0 gap-2">
          {!hideSemesterFilter && semesterSelect()}
          {batchSelect()}
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

      {(isLoading || isLoadingReachedTerms) && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Loading…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-8 text-center text-destructive">
          Couldn&apos;t load notices. Try refreshing.
        </div>
      )}

      {!isLoading && !isLoadingReachedTerms && !isError && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {notices && notices.length > 0 ? "No matches." : "Nothing here yet."}
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="flex flex-col gap-3">
          {filtered.map((notice) => (
            <li
              key={notice.id}
              className={cn(
                "rounded-lg border bg-card p-4",
                notice.is_pinned ? "border-primary/40" : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {notice.is_pinned && (
                      <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-primary" />
                    )}
                    <p className="text-foreground">{notice.title}</p>
                    {/* Only ever true here because RLS already kept a
                        cr_only notice from being fetched at all unless
                        this viewer is signed in as CR/admin — a
                        student's browser never receives this row to
                        begin with (see supabase/add_notice_cr_only.sql),
                        so no extra role check is needed just to show
                        the badge. */}
                    {notice.cr_only && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                        CR only
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-subtle-foreground">
                    {formatShortDate(notice.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canManage && (
                    <PinButton pinned={notice.is_pinned} onToggle={() => handleTogglePin(notice)} />
                  )}
                  {notice.pdf_url && (
                    <>
                      <button
                        type="button"
                        onClick={() => setViewingNotice(notice)}
                        aria-label="View"
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!notice.pdf_url) return;
                          const withoutQuery = notice.pdf_url.split("?")[0];
                          const ext = withoutQuery.includes(".")
                            ? withoutQuery.slice(withoutQuery.lastIndexOf("."))
                            : "";
                          downloadFile(notice.pdf_url, `${notice.title}${ext}`);
                        }}
                        aria-label="Download"
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {notice.body && (
                <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
                  {notice.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <ResourceViewerDialog
        resource={viewingNotice?.pdf_url ? { title: viewingNotice.title, file_url: viewingNotice.pdf_url } : null}
        open={viewingNotice !== null}
        onOpenChange={(open) => {
          if (!open) setViewingNotice(null);
        }}
      />
    </div>
  );
}
