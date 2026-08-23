"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

import { useBranch } from "@/hooks/useBranch";
import { useBranches } from "@/features/branches/queries";
import { cn } from "@/lib/utils";

export function BranchSwitcher() {
  const { branch, setBranch } = useBranch();
  // Reads from the `branches` table — see BranchSelectCard's comment,
  // same reasoning applies here.
  const { data: branches } = useBranches();
  const current = branches?.find((b) => b.slug === branch);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Switch branch"
        >
          <span className="min-w-0 truncate">{current?.name ?? "Select branch"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          // Radix returns focus to the trigger button when the menu
          // closes (its own default, for keyboard users) — but that's
          // a programmatic focus() call, not a real keystroke, and
          // Safari and Chrome disagree on whether a focus-visible ring
          // should show for it. Chrome mostly doesn't; Safari does,
          // and leaves it sitting there after every selection. Since
          // the trigger's current value is already visible as its own
          // label, there's nothing lost by not re-focusing it.
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[--radix-dropdown-menu-trigger-width] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {branches?.map((b) => (
            <DropdownMenu.Item
              key={b.slug}
              onSelect={() => setBranch(b.slug)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm font-medium text-foreground outline-none data-[highlighted]:bg-background-secondary"
              )}
            >
              {b.name}
              {b.slug === branch && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
