"use client";

import { useState, useTransition } from "react";
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
  // A session expiring mid-toggle, or a race with someone else already
  // deleting this exact row, used to throw straight through
  // startTransition uncaught — since this button is shared by every
  // pinnable list (resources, notices, updates), that took down
  // whichever whole page it was clicked on, not just this button.
  // Caught here once instead of at every call site; a failed toggle
  // just reverts to its prior look after a moment instead of crashing.
  const [failed, setFailed] = useState(false);

  function handleClick() {
    setFailed(false);
    startTransition(async () => {
      try {
        await onToggle();
      } catch (err) {
        console.error(err);
        setFailed(true);
        setTimeout(() => setFailed(false), 3000);
      }
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      aria-label={failed ? "Couldn't update — try again" : pinned ? "Unpin" : "Pin to top"}
      title={failed ? "Couldn't update — try again" : pinned ? "Unpin" : "Pin to top"}
      className={cn(
        "rounded-md p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 lg:p-2",
        failed
          ? "text-destructive"
          : pinned
            ? "text-primary"
            : "text-muted-foreground hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
      )}
    >
      <Pin className={cn("h-4 w-4", pinned && !failed && "fill-current")} />
    </button>
  );
}
