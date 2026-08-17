"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBatch } from "@/hooks/useBatch";
import { useSubjectStructureConfig } from "@/features/resources/queries";
import { setSubjectInterchange } from "@/features/resources/actions";

// The button is the controlled, manual side of the 2026-27 CSE Core/
// AIML/AIDS 1st-Year Sem 2 transition specifically (see the "FINAL CSE
// SEMESTER + INTERCHANGE SYSTEM" spec, section 3) — 2025-26's own Sem 2
// already resolves automatically (no button needed there, per section
// 1), and every other specialization/branch has its own independent
// mapping untouched by this system entirely.
//
// Visibility reacts to the SAME sidebar/Cockpit selection (useBranch/
// useSpecialization/useBatch) every other page already treats as the
// one shared source of "what context is currently active" — an admin
// sees this control only while actually looking at that one context,
// not as a general-purpose switch sitting on Manage regardless of what
// they've selected.
//
// Underlying mechanism is deliberately UNCHANGED — still the single
// global subject_structure_config.interchange_active flag, not a new
// per-batch lock. It's a stateless, read-time resolver (see
// subjectInterchange.ts) that never duplicates or moves data no matter
// how many times it's flipped, which is what makes "can't
// double-interchange" true structurally rather than needing a new
// one-time-use schema. The one real consequence worth knowing: because
// the flag is global, flipping it here also retroactively changes
// 2025-26's already-live Sem 2 mapping (both batches share the same
// rule) — a deliberate reading of the spec's own "ONE source of truth"
// requirement (section 6), not an oversight.
const CORE_AIML_AIDS_SLUGS = new Set(["cse-core", "cse-aiml", "cse-aids"]);
const TRANSITION_BATCH_LABEL = "2026-27";

/**
 * Admin-only, one-click, reversible — flips subject_structure_config's
 * single flag. Every student/CR page resolving a subject list
 * (useSubjects, see subjectInterchange.ts) picks up the new value on
 * its next fetch; nothing here duplicates or moves any actual data.
 */
export function SubjectInterchangeControl() {
  const { data: config } = useSubjectStructureConfig();
  const { branch } = useBranch();
  const { specialization } = useSpecialization();
  const { batch } = useBatch();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const active = config?.interchange_active ?? false;

  const isApplicableContext =
    branch === "cse" && !!specialization && CORE_AIML_AIDS_SLUGS.has(specialization) && batch === TRANSITION_BATCH_LABEL;
  if (!isApplicableContext) return null;

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
        CSE — AIML, Core, AIDS subject structure
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
