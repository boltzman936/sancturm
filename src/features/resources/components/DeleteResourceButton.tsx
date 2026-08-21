"use client";

import { useState, useTransition } from "react";
import { deleteResource } from "@/features/resources/actions";

export function DeleteResourceButton({ resourceId }: { resourceId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!confirm("Remove this resource? Students won't be able to see it anymore.")) return;
          setError(null);
          // Unhandled — a session expiring mid-delete, or a race with
          // someone else already deleting this same row, used to throw
          // straight past this component and take down the entire page
          // to the route error boundary instead of just this button.
          startTransition(async () => {
            try {
              await deleteResource(resourceId);
            } catch (err) {
              console.error(err);
              setError("Couldn't remove this. Try again.");
            }
          });
        }}
        className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Removing…" : "Remove"}
      </button>
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </div>
  );
}
