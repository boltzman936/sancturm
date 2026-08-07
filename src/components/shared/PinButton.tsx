"use client";

import { useTransition } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared by resources, notices, and Sancturm updates — three
// different tables, three different server actions, but the same
// small toggle control and the same disabled-while-pending behavior.
export function PinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(onToggle)}
      aria-label={pinned ? "Unpin" : "Pin to top"}
      title={pinned ? "Unpin" : "Pin to top"}
      className={cn(
        "rounded-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        pinned
          ? "text-primary"
          : "text-muted-foreground hover:bg-background-secondary hover:text-foreground"
      )}
    >
      <Pin className={cn("h-4 w-4", pinned && "fill-current")} />
    </button>
  );
}
