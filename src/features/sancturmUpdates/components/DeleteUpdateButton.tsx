"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { deleteSancturmUpdate } from "@/features/sancturmUpdates/actions";

// Deliberately a small icon button, not a labeled "Remove" — this is
// admin's own quiet control sitting on an otherwise public card, not
// a primary action anyone else on the page needs to notice.
export function DeleteUpdateButton({ updateId }: { updateId: string }) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label="Remove update"
      title="Remove update"
      onClick={() => {
        if (!confirm("Remove this update?")) return;
        startTransition(async () => {
          await deleteSancturmUpdate(updateId);
          queryClient.invalidateQueries({ queryKey: ["sancturm-updates"] });
        });
      }}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
