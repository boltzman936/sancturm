"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Pin, Search } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useBranchBySlug } from "@/features/branches/queries";
import { useNotices } from "@/features/notices/queries";
import { toggleNoticePin } from "@/features/notices/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import type { Notice } from "@/features/notices/types";
import { localDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function matchesSearch(notice: Notice, query: string) {
  if (!query.trim()) return true;
  const haystack = [notice.title, notice.body ?? "", formatTimestamp(notice.created_at)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

// View-only — publishing happens from the CR dashboard's Upload flow,
// removal happens from Manage. This page just shows what's live.
export default function NoticesPage() {
  const { branch: branchSlug } = useBranch();
  const { data: branch } = useBranchBySlug(branchSlug);
  const { data: notices, isLoading, isError } = useNotices(branch?.id ?? null);
  const { data: role } = useCurrentRole();
  const queryClient = useQueryClient();

  // A CR can browse another branch's notices like a normal student
  // (no manage powers there) — pinning only works on their own branch,
  // same as everything else in the CR permission model.
  const canManage = role?.type === "admin" || (role?.type === "cr" && role.branchId === branch?.id);

  async function handleTogglePin(notice: Notice) {
    await toggleNoticePin(notice.id, !notice.is_pinned);
    queryClient.invalidateQueries({ queryKey: ["notices", branch?.id] });
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewingNotice, setViewingNotice] = useState<Notice | null>(null);

  const filtered = useMemo(() => {
    const base = notices ?? [];
    const byDate = dateFilter
      ? base.filter((notice) => localDateKey(notice.created_at) === dateFilter)
      : base;
    return byDate.filter((notice) => matchesSearch(notice, searchQuery));
  }, [notices, dateFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-medium text-foreground">Notices</h1>
        <p className="text-muted-foreground">
          Official PDFs for {branch?.name ?? "your branch"}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

      {isLoading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Loading…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-8 text-center text-destructive">
          Couldn&apos;t load notices. Try refreshing.
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
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
                  </div>
                  <p className="mt-1 font-mono text-xs text-subtle-foreground">
                    {formatTimestamp(notice.created_at)}
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
                      <a
                        href={notice.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Download"
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                      >
                        <Download className="h-4 w-4" />
                      </a>
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
