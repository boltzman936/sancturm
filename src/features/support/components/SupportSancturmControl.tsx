"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSupportConfig } from "@/features/support/queries";
import { updateSupportConfig, setSupportEnabled } from "@/features/support/actions";

/**
 * Admin-only config panel — the only place upi_id/qr_url/suggested
 * amounts/message ever get set. Every field here maps 1:1 to a column
 * updateSupportConfig validates server-side (see its own comments);
 * this form's own constraints are just UX, not the real boundary.
 */
export function SupportSancturmControl() {
  const { data: config } = useSupportConfig();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [amounts, setAmounts] = useState("");
  const [message, setMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Populated imperatively when the dialog is opened (see
  // openEditor below), not synced reactively from `config` — this is
  // a one-shot "load current values into a draft form" action tied to
  // the user opening the editor, not an ongoing subscription to
  // config changes (which would fight with what they're mid-typing).
  function openEditor() {
    if (config) {
      setUpiId(config.upi_id ?? "");
      setQrUrl(config.qr_url ?? "");
      setAmounts(config.suggested_amounts.join(", "));
      setMessage(config.support_message);
      setInstructions(config.payment_instructions);
    }
    setEditing(true);
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["support-config"] });
  }

  function handleToggleEnabled() {
    if (!config) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSupportEnabled(!config.enabled);
        invalidate();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Couldn't change that. Try again.");
      }
    });
  }

  function handleSave() {
    setError(null);
    const parsedAmounts = amounts
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    startTransition(async () => {
      try {
        await updateSupportConfig({
          upiId: upiId.trim() || null,
          qrUrl: qrUrl.trim() || null,
          suggestedAmounts: parsedAmounts.length > 0 ? parsedAmounts : undefined,
          supportMessage: message,
          paymentInstructions: instructions,
        });
        invalidate();
        setEditing(false);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Support Sancturm</h2>
      <p className="mt-1 text-sm text-foreground">
        Currently: <span className="font-medium">{config?.enabled ? "Live" : "Not needed yet"}</span>
        {config?.updated_by && (
          <span className="text-subtle-foreground"> — last changed by {config.updated_by}</span>
        )}
      </p>
      {config?.enabled && !config.upi_id && (
        <p className="mt-1 font-mono text-xs text-destructive">
          Enabled but no UPI ID set — students still see nothing until one is added.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleToggleEnabled}
          disabled={isPending}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary disabled:pointer-events-none disabled:opacity-50"
        >
          {config?.enabled ? "Disable Support" : "Enable Support"}
        </button>
        <button
          type="button"
          onClick={openEditor}
          className="rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
        >
          Edit configuration
        </button>
      </div>

      <Dialog open={editing} onOpenChange={(open) => !open && setEditing(false)}>
        <DialogContent className="max-w-md">
          <div className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">Support Sancturm configuration</h2>

            <label className="flex flex-col gap-1 text-xs text-subtle-foreground">
              UPI ID
              <input
                value={upiId}
                onChange={(event) => setUpiId(event.target.value)}
                placeholder="name@bank"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-subtle-foreground">
              QR image URL
              <input
                value={qrUrl}
                onChange={(event) => setQrUrl(event.target.value)}
                placeholder="https://…"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-subtle-foreground">
              Suggested amounts (comma-separated, ₹)
              <input
                value={amounts}
                onChange={(event) => setAmounts(event.target.value)}
                placeholder="49, 99, 199, 499"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-subtle-foreground">
              Message shown while disabled
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={3}
                className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-subtle-foreground">
              Payment instructions (shown once enabled)
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={3}
                className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
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
