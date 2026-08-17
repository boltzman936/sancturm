"use client";

import { useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useContributions } from "@/features/support/queries";
import { verifyContribution } from "@/features/support/actions";
import { cn } from "@/lib/utils";
import type { Contribution, ContributionStatus } from "@/features/support/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<ContributionStatus, string> = {
  pending: "Pending",
  successful: "Successful",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STATUS_CLASS: Record<ContributionStatus, string> = {
  pending: "border-border text-muted-foreground",
  successful: "border-primary/40 text-primary",
  failed: "border-destructive/40 text-destructive",
  cancelled: "border-border text-subtle-foreground",
  refunded: "border-border text-subtle-foreground",
};

/**
 * Admin-only. Never a public leaderboard — this is the ONE view that
 * can read `contributions` at all (RLS restricts SELECT to admins),
 * and it stays behind the same admin-only mount as MaintenanceControl
 * on top of that.
 */
export function ContributionsPanel() {
  const { data: contributions, isLoading, isError } = useContributions();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const base = { successful: 0, pending: 0, failedOrCancelled: 0 };
    for (const c of contributions ?? []) {
      if (c.status === "successful") base.successful += c.amount;
      else if (c.status === "pending") base.pending += c.amount;
      else base.failedOrCancelled += c.amount;
    }
    return base;
  }, [contributions]);

  function handleVerify(id: string, decision: "successful" | "failed") {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      try {
        await verifyContribution(id, decision);
        queryClient.invalidateQueries({ queryKey: ["contributions"] });
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Couldn't update that. Try again.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Contributions</h2>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border bg-background-secondary p-3">
          <p className="font-mono text-[10px] text-subtle-foreground">Successful</p>
          <p className="mt-0.5 text-lg font-medium text-primary">₹{totals.successful}</p>
        </div>
        <div className="rounded-md border border-border bg-background-secondary p-3">
          <p className="font-mono text-[10px] text-subtle-foreground">Pending</p>
          <p className="mt-0.5 text-lg font-medium text-foreground">₹{totals.pending}</p>
        </div>
        <div className="rounded-md border border-border bg-background-secondary p-3">
          <p className="font-mono text-[10px] text-subtle-foreground">Failed / cancelled</p>
          <p className="mt-0.5 text-lg font-medium text-subtle-foreground">₹{totals.failedOrCancelled}</p>
        </div>
      </div>

      {error && <p className="mt-2 font-mono text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Couldn&apos;t load contributions.</p>}
        {!isLoading && !isError && (contributions?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">No contributions yet.</p>
        )}
        {contributions?.map((c: Contribution) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background-secondary p-3"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">₹{c.amount}</span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                    STATUS_CLASS[c.status]
                  )}
                >
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <span className="font-mono text-xs text-subtle-foreground">
                {formatDate(c.created_at)}
                {!c.is_anonymous && c.display_name ? ` — ${c.display_name}` : ""}
                {c.utr ? ` — UTR ${c.utr}` : ""}
              </span>
            </div>
            {c.status === "pending" && (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleVerify(c.id, "successful")}
                  disabled={isPending && pendingId === c.id}
                  className="rounded-md border border-primary/40 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 active:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                >
                  Mark successful
                </button>
                <button
                  type="button"
                  onClick={() => handleVerify(c.id, "failed")}
                  disabled={isPending && pendingId === c.id}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background active:bg-background disabled:pointer-events-none disabled:opacity-50"
                >
                  Mark failed
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
