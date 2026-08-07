"use client";

import { useTransition } from "react";
import { deleteResource } from "@/features/resources/actions";

export function DeleteResourceButton({ resourceId }: { resourceId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Remove this resource? Students won't be able to see it anymore.")) return;
        startTransition(() => deleteResource(resourceId));
      }}
      className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
    >
      {isPending ? "Removing…" : "Remove"}
    </button>
  );
}
