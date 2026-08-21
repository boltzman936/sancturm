"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Pin, Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useTerm } from "@/hooks/useTerm";
import { useLiveTermForYear } from "@/hooks/useBatchSemesterFilter";
import { useBranchBySlug, useSpecializations } from "@/features/branches/queries";
import { useTermBySlug, useTerms } from "@/features/terms/queries";
import { useNotices } from "@/features/notices/queries";
import { useLatestNotice, useLastSeenNotice } from "@/features/notices/useLatestNotice";
import { toggleNoticePin } from "@/features/notices/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { DownloadButton } from "@/components/shared/DownloadButton";
import { ResourceListSkeleton } from "@/features/resources/components/ResourceListSkeleton";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import type { Notice } from "@/features/notices/types";
import { localDateKey, formatShortDate } from "@/lib/date";
import { sortByPinnedThenDate, type DateSortOrder } from "@/lib/sortByDate";
import { cn } from "@/lib/utils";

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

  // No Batch dimension here at all — a notice is scoped purely by
  // Branch + Specialization + Year + whichever semester is genuinely
  // live right now, worked out automatically (see useLiveTermForYear's
  // own comment). Unlike Notes & Lab / PYQs, there's no Semester picker
  // either: Notices represents "what's current," not a browsable
  // archive.
  const { term: sidebarTermSlug } = useTerm();
  const { data: sidebarTerm } = useTermBySlug(sidebarTermSlug);
  const yearNumber = sidebarTerm?.year_number;
  const liveTermId = useLiveTermForYear(yearNumber);
  const isLoadingReachedTerms = yearNumber !== undefined && liveTermId === undefined;
  const hasNoReachedBatches = liveTermId === null;
  const { data: allTerms } = useTerms();
  const term = allTerms?.find((t) => t.id === liveTermId);
  const specializationName = branchSpecializations?.find((s) => s.slug === specializationSlug)?.name;

  const { data: notices, isLoading, isError } = useNotices(
    branch?.id ?? null,
    specializationId,
    branch?.has_specializations ?? false,
    liveTermId ?? null
  );
  const { data: role } = useCurrentRole();
  const queryClient = useQueryClient();

  // Sidebar's own unread red dot (see useLatestNotice's comment) — same
  // (branch, specialization, live term) scope this page itself uses
  // now, so it only ever clears once the real current-semester notice
  // has actually been seen here.
  const { data: latestNotice } = useLatestNotice(
    branch?.id ?? null,
    specializationId,
    branch?.has_specializations ?? false,
    liveTermId ?? null
  );
  const { markSeen } = useLastSeenNotice(branch?.id ?? null, specializationId);
  useEffect(() => {
    if (!latestNotice || !notices) return;
    if (notices.some((n) => n.id === latestNotice.id)) markSeen(latestNotice.id);
  }, [latestNotice, notices, markSeen]);

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

  // No Batch/Semester pickers here at all anymore — see this file's
  // top-level comment. "Not reached yet" still applies (a brand-new
  // Year with nothing live yet for it) — same fallback shape as Notes
  // & Lab / PYQs' identical check, just keyed off liveTermId being
  // null instead of hasNoReachedBatches.
  if (!isLoadingReachedTerms && hasNoReachedBatches) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-medium text-foreground">Notices</h1>
          <p className="text-muted-foreground">
            Official PDFs for {specializationName ?? branch?.name ?? "your branch"}.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Nothing live for {specializationName ?? branch?.name ?? "this branch"} right now.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Notices</h1>
        <p className="text-muted-foreground">
          Official PDFs for {branch?.name ?? "your branch"}
          {term ? `, ${term.label}` : ""}.
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
                  ? "bg-primary text-primary-foreground shadow-sm"
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

      {(isLoading || isLoadingReachedTerms) && <ResourceListSkeleton count={3} />}

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
          {filtered.map((notice) => {
            const pdfUrlWithoutQuery = notice.pdf_url?.split("?")[0] ?? "";
            const pdfExtension = pdfUrlWithoutQuery.includes(".")
              ? pdfUrlWithoutQuery.slice(pdfUrlWithoutQuery.lastIndexOf("."))
              : "";
            return (
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
                      <DownloadButton
                        url={notice.pdf_url}
                        filename={`${notice.title}${pdfExtension}`}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                      />
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
            );
          })}
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
