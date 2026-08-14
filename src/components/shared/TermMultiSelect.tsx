"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

type TermOption = { id: string; label: string };

/**
 * Pick any combination of years/semesters in one control — mirrors
 * BranchMultiSelect exactly, just for the other axis. Admin-only
 * everywhere this is used: a CR is always scoped to their own single
 * term already (see each caller's fixedTermId).
 */
export function TermMultiSelect({
  terms,
  selectedTermIds,
  onChange,
}: {
  terms: TermOption[];
  selectedTermIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors hover:border-primary active:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>
            {selectedTermIds.length === 0
              ? "Select year"
              : selectedTermIds.length === terms.length
                ? "All years"
                : selectedTermIds.length === 1
                  ? terms.find((t) => t.id === selectedTermIds[0])?.label
                  : `${selectedTermIds.length} years selected`}
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
            checked={selectedTermIds.length === terms.length}
            onCheckedChange={(checked) => onChange(checked ? terms.map((t) => t.id) : [])}
            onSelect={(event) => event.preventDefault()}
            className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm font-medium text-foreground outline-none data-[highlighted]:bg-background-secondary"
          >
            All years
            {selectedTermIds.length === terms.length && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenu.CheckboxItem>
          <div className="my-1 h-px bg-border" />
          {terms.map((term) => {
            const checked = selectedTermIds.includes(term.id);
            return (
              <DropdownMenu.CheckboxItem
                key={term.id}
                checked={checked}
                onCheckedChange={(next) =>
                  onChange(next ? [...selectedTermIds, term.id] : selectedTermIds.filter((id) => id !== term.id))
                }
                onSelect={(event) => event.preventDefault()}
                className="flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-background-secondary"
              >
                {term.label}
                {checked && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
