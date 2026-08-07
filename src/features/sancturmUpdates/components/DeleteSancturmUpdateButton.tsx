"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteSancturmUpdate } from "@/features/sancturmUpdates/actions";

export function DeleteSancturmUpdateButton({ updateId }: { updateId: string }) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Remove this update?")) return;
        startTransition(async () => {
          await deleteSancturmUpdate(updateId);
          // Same reasoning as everywhere else this pattern appears —
          // revalidatePath only refreshes server-rendered pages, not
          // the client-side TanStack Query cache /sancturm-updates reads from.
          queryClient.invalidateQueries({ queryKey: ["sancturm-updates"] });
        });
      }}
      className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
    >
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}
