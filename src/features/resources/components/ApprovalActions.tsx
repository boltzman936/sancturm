"use client";

import { useTransition } from "react";
import { approveResource, rejectResource } from "@/features/resources/actions";

export function ApprovalActions({
  resourceId,
  fileUrl,
}: {
  resourceId: string;
  fileUrl: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
      >
        Preview
      </a>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => rejectResource(resourceId))}
        className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
      >
        Reject
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => approveResource(resourceId))}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        Approve
      </button>
    </div>
  );
}
