"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBranchBySlug, useSpecializations } from "@/features/branches/queries";
import { cn } from "@/lib/utils";

/**
 * Mirrors BranchSwitcher exactly, one dimension down — only rendered
 * by Sidebar when the current branch has_specializations (CSE today).
 * A branch switch away and back leaves the last-picked specialization
 * in localStorage untouched (same "independent, not reset" behavior
 * every other switcher here already has for its own dimension).
 */
export function SpecializationSwitcher() {
  const { branch } = useBranch();
  const { data: currentBranch } = useBranchBySlug(branch);
  const { specialization, setSpecialization } = useSpecialization();
  const { data: specializations } = useSpecializations(currentBranch?.id ?? null);
  const current = specializations?.find((s) => s.slug === specialization);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Switch specialization"
        >
          <span className="min-w-0 truncate">{current?.name ?? "Select specialization"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[--radix-dropdown-menu-trigger-width] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {specializations?.map((s) => (
            <DropdownMenu.Item
              key={s.slug}
              onSelect={() => setSpecialization(s.slug)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm font-medium text-foreground outline-none data-[highlighted]:bg-background-secondary"
              )}
            >
              {s.name}
              {s.slug === specialization && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
