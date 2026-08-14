"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";

import { useTerm } from "@/hooks/useTerm";
import { useCurrentTermsByYear } from "@/features/terms/queries";
import { cn } from "@/lib/utils";

// Mirrors BranchSwitcher exactly — same dropdown, same DB-driven
// source, just for the other half of "which cohort's content do I
// see". Kept as its own separate switcher (not merged into one
// combined control) so switching term doesn't force re-picking branch
// and vice versa.
//
// useCurrentTermsByYear, not useTerms() — see TermSelectCard's
// identical comment: a year can have more than one term now, and this
// switcher still only ever offers "which year", not "which semester".
export function TermSwitcher() {
  const { term, setTerm } = useTerm();
  const { data: terms } = useCurrentTermsByYear();
  const current = terms?.find((t) => t.slug === term);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Switch year"
        >
          <span>{current ? current.label.split(" - ")[0] : "Select year"}</span>
          <ChevronsUpDown className="h-4 w-4 text-subtle-foreground" />
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
          {terms?.map((t) => (
            <DropdownMenu.Item
              key={t.slug}
              onSelect={() => setTerm(t.slug)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-sm px-2 py-2 text-sm text-foreground outline-none data-[highlighted]:bg-background-secondary"
              )}
            >
              {t.label.split(" - ")[0]}
              {t.slug === term && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
