"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

type BranchOption = { id: string; name: string };

/**
 * Pick any combination of branches (or, via itemLabel/itemLabelPlural,
 * specializations within one branch — same generic id/name shape) in
 * one control — selecting every item IS "publish to all of them";
 * there's no separate mode for it. Admin-only everywhere this is used:
 * a CR is always scoped to their own single branch/specialization
 * already (see each caller's fixedBranchId), so this never even
 * renders for them.
 */
export function BranchMultiSelect({
  branches,
  selectedBranchIds,
  onChange,
  itemLabel = "branch",
  itemLabelPlural = "branches",
}: {
  branches: BranchOption[];
  selectedBranchIds: string[];
  onChange: (ids: string[]) => void;
  itemLabel?: string;
  itemLabelPlural?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors hover:border-primary active:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            {selectedBranchIds.length === 0
              ? `Select ${itemLabel}`
              : selectedBranchIds.length === branches.length
                ? `All ${itemLabelPlural}`
                : selectedBranchIds.length === 1
                  ? branches.find((b) => b.id === selectedBranchIds[0])?.name
                  : `${selectedBranchIds.length} ${itemLabelPlural} selected`}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-subtle-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[--radix-dropdown-menu-trigger-width] overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DropdownMenu.CheckboxItem
            checked={selectedBranchIds.length === branches.length}
            onCheckedChange={(checked) => onChange(checked ? branches.map((b) => b.id) : [])}
            onSelect={(event) => event.preventDefault()}
            className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm font-medium text-foreground outline-none data-[highlighted]:bg-background-secondary"
          >
            All {itemLabelPlural}
            {selectedBranchIds.length === branches.length && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenu.CheckboxItem>
          <div className="my-1 h-px bg-border" />
          {branches.map((branch) => {
            const checked = selectedBranchIds.includes(branch.id);
            return (
              <DropdownMenu.CheckboxItem
                key={branch.id}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next ? [...selectedBranchIds, branch.id] : selectedBranchIds.filter((id) => id !== branch.id))
                }
                onSelect={(event) => event.preventDefault()}
                className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-background-secondary"
              >
                {branch.name}
                {checked && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
