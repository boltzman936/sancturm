"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Pin, Search, Sparkles } from "lucide-react";
import { useSancturmUpdates } from "@/features/sancturmUpdates/queries";
import { DeleteUpdateButton } from "@/features/sancturmUpdates/components/DeleteUpdateButton";
import { toggleSancturmUpdatePin } from "@/features/sancturmUpdates/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import type { SancturmUpdate } from "@/features/sancturmUpdates/types";
import { localDateKey, formatShortDate } from "@/lib/date";
import { cn, downloadFile } from "@/lib/utils";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < NEW_WINDOW_MS;
}

function matchesSearch(update: SancturmUpdate, query: string) {
  if (!query.trim()) return true;
  const haystack = [update.title, update.body ?? "", formatShortDate(update.created_at)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

// View-only for everyone — publishing happens from the Controller's
// dashboard's Upload flow; removal happens from this page's own small
// inline control, which only admin ever sees.
export default function SancturmUpdatesPage() {
  const { data: updates, isLoading, isError } = useSancturmUpdates();
  const { data: role } = useCurrentRole();
  const canManage = role?.type === "admin";
  const queryClient = useQueryClient();

  async function handleTogglePin(update: SancturmUpdate) {
    await toggleSancturmUpdatePin(update.id, !update.is_pinned);
    queryClient.invalidateQueries({ queryKey: ["sancturm-updates"] });
  }

  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [viewingUpdate, setViewingUpdate] = useState<SancturmUpdate | null>(null);

  const filtered = useMemo(() => {
    const base = updates ?? [];
    const byDate = dateFilter
      ? base.filter((update) => localDateKey(update.created_at) === dateFilter)
      : base;
    return byDate.filter((update) => matchesSearch(update, searchQuery));
  }, [updates, dateFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-medium text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          Sancturm updates
        </h1>
        <p className="text-muted-foreground">What&apos;s new on the platform.</p>
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
          Couldn&apos;t load updates. Try refreshing.
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {updates && updates.length > 0 ? "No matches." : "Nothing here yet."}
        </div>
      )}

      {filtered.length > 0 && (
        <ol className="relative flex flex-col gap-5 border-l border-border pl-6">
          {filtered.map((update) => (
            <li key={update.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary"
              />

              <div
                className={cn(
                  "rounded-lg border bg-card p-4",
                  update.is_pinned ? "border-primary/40" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {update.is_pinned && (
                        <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-primary" />
                      )}
                      <p className="text-foreground">{update.title}</p>
                      {isRecent(update.created_at) && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] tracking-wide text-primary">
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs text-subtle-foreground">
                      {formatShortDate(update.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {canManage && (
                      <PinButton pinned={update.is_pinned} onToggle={() => handleTogglePin(update)} />
                    )}
                    {update.pdf_url && (
                      <>
                        <button
                          type="button"
                          onClick={() => setViewingUpdate(update)}
                          aria-label="View"
                          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!update.pdf_url) return;
                            const withoutQuery = update.pdf_url.split("?")[0];
                            const ext = withoutQuery.includes(".")
                              ? withoutQuery.slice(withoutQuery.lastIndexOf("."))
                              : "";
                            downloadFile(update.pdf_url, `${update.title}${ext}`);
                          }}
                          aria-label="Download"
                          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {canManage && <DeleteUpdateButton updateId={update.id} />}
                  </div>
                </div>

                {update.body && (
                  <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
                    {update.body}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <ResourceViewerDialog
        resource={viewingUpdate?.pdf_url ? { title: viewingUpdate.title, file_url: viewingUpdate.pdf_url } : null}
        open={viewingUpdate !== null}
        onOpenChange={(open) => {
          if (!open) setViewingUpdate(null);
        }}
      />
    </div>
  );
}
