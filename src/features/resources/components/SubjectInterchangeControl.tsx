"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSubjectStructureConfig } from "@/features/resources/queries";
import { setSubjectInterchange } from "@/features/resources/actions";

/**
 * Admin-only, one-click, reversible — flips subject_structure_config's
 * single flag. Every student/CR page resolving a subject list
 * (useSubjects, see subjectInterchange.ts) picks up the new value on
 * its next fetch; nothing here duplicates or moves any actual data.
 */
export function SubjectInterchangeControl() {
  const { data: config } = useSubjectStructureConfig();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = config?.interchange_active ?? false;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await setSubjectInterchange(!active);
        setOpen(false);
      } catch (err) {
        console.error(err);
        setError("Couldn't change the structure. Try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">
        1st Year — Sem 2 subject structure
      </h2>
      <p className="mt-1 text-sm text-foreground">
        Currently: <span className="font-medium">{active ? "Interchanged" : "Normal"}</span>
        {config?.updated_by && (
          <span className="text-subtle-foreground"> — last changed by {config.updated_by}</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
      >
        Switch to {active ? "Normal 2nd Sem Structure" : "Interchanged Structure"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col gap-3 p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">
              Switch to {active ? "Normal" : "Interchanged"} structure?
            </h2>
            <p className="text-sm text-muted-foreground">
              This affects every CSE Core, AIML, and AIDS student and CR browsing or
              uploading 1st-Year Sem 2 content —{" "}
              {active
                ? "Core/AIML and AIDS go back to their own subject lists."
                : "Core and AIML will use AIDS's subject list, and AIDS will use Core/AIML's."}{" "}
              Existing uploads keep working either way — nothing is deleted or moved. This
              is reversible at any time.
            </p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? "Switching…" : "Confirm switch"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
