"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useMaintenanceConfig } from "@/features/maintenance/queries";
import { takeOffline, extendMaintenance, bringOnline } from "@/features/maintenance/actions";

function isActive(until: string | null | undefined, now: number) {
  return !!until && new Date(until).getTime() > now;
}

const QUICK_DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hr", minutes: 120 },
];

function formatUntil(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Admin-only. `maintenance_config.until` is the single source of
 * truth for whether the site is currently offline — every student/CR
 * request gets checked against it in middleware (see src/middleware.ts),
 * this panel just reads/writes the same row.
 */
export function MaintenanceControl() {
  const { data: config } = useMaintenanceConfig();
  const queryClient = useQueryClient();
  const [dialogMode, setDialogMode] = useState<"offline" | "extend" | "online" | null>(null);
  const [message, setMessage] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The DB row itself doesn't change just because time passes — it
  // still holds the SAME `until` value it always did — so React
  // Query's structural sharing keeps returning the identical cached
  // object on every 15s refetch, and this component never re-renders,
  // never re-evaluating isActive() against the now-current clock. A
  // manually-ticked `now` is what actually forces the "was offline,
  // window has since passed" transition to show up here without a
  // manual page reload — same fix MaintenanceCountdown already needed
  // for its own live countdown, just applied here too.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const active = isActive(config?.until, now);

  function closeDialog() {
    setDialogMode(null);
    setMessage("");
    setMinutes(30);
    setCustomMinutes("");
    setError(null);
  }

  function resolveMinutes() {
    const custom = customMinutes.trim() ? Number(customMinutes) : null;
    return custom && custom > 0 ? custom : minutes;
  }

  function handleTakeOffline() {
    setError(null);
    startTransition(async () => {
      try {
        await takeOffline(message, resolveMinutes());
        queryClient.invalidateQueries({ queryKey: ["maintenance-config"] });
        closeDialog();
      } catch (err) {
        console.error(err);
        setError("Couldn't take the site offline. Try again.");
      }
    });
  }

  function handleExtend() {
    setError(null);
    startTransition(async () => {
      try {
        await extendMaintenance(resolveMinutes());
        queryClient.invalidateQueries({ queryKey: ["maintenance-config"] });
        closeDialog();
      } catch (err) {
        console.error(err);
        setError("Couldn't extend maintenance. Try again.");
      }
    });
  }

  function handleBringOnline() {
    setError(null);
    startTransition(async () => {
      try {
        await bringOnline();
        queryClient.invalidateQueries({ queryKey: ["maintenance-config"] });
        closeDialog();
      } catch (err) {
        console.error(err);
        setError("Couldn't bring the site back online. Try again.");
      }
    });
  }

  const durationPicker = (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 rounded-md border border-border bg-background p-1">
        {QUICK_DURATIONS.map((d) => (
          <button
            key={d.minutes}
            type="button"
            onClick={() => {
              setMinutes(d.minutes);
              setCustomMinutes("");
            }}
            className={`flex-1 rounded px-2 py-1.5 text-sm transition-colors ${
              !customMinutes && minutes === d.minutes
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground active:text-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        value={customMinutes}
        onChange={(event) => setCustomMinutes(event.target.value)}
        placeholder="Custom (minutes)"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Maintenance mode</h2>
      <p className="mt-1 text-sm text-foreground">
        Currently:{" "}
        <span className="font-medium">
          {active ? `Offline until ${formatUntil(config!.until!)}` : "Live"}
        </span>
        {config?.updated_by && (
          <span className="text-subtle-foreground"> — last changed by {config.updated_by}</span>
        )}
      </p>

      <div className="mt-3 flex gap-2">
        {!active && (
          <button
            type="button"
            onClick={() => setDialogMode("offline")}
            className="rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10"
          >
            Take Sancturm Offline
          </button>
        )}
        {active && (
          <>
            <button
              type="button"
              onClick={() => setDialogMode("extend")}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
            >
              Extend Maintenance
            </button>
            <button
              type="button"
              onClick={() => setDialogMode("online")}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
            >
              Bring Online Now
            </button>
          </>
        )}
      </div>

      <Dialog open={dialogMode === "offline"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col gap-3 p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">Take Sancturm offline?</h2>
            <p className="text-sm text-muted-foreground">
              Students and CRs will be redirected to a maintenance page for the duration below.
              You keep full access the whole time.
            </p>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Message shown to students (optional)"
              rows={3}
              className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {durationPicker}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleTakeOffline}
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? "Taking offline…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
              >
                Cancel
              </button>
            </div>
            {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "extend"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col gap-3 p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">Extend maintenance</h2>
            <p className="text-sm text-muted-foreground">Adds time to the current window.</p>
            {durationPicker}
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleExtend}
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? "Extending…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
              >
                Cancel
              </button>
            </div>
            {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogMode === "online"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col gap-3 p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">Bring Sancturm back online?</h2>
            <p className="text-sm text-muted-foreground">
              Ends maintenance immediately, regardless of how much time was left.
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleBringOnline}
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? "Bringing online…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
              >
                Cancel
              </button>
            </div>
            {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
