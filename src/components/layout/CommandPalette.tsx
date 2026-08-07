"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  HelpCircle,
  Megaphone,
  MessageSquare,
  Sparkles,
  UserRound,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";

// This is the nav-jump version — "go to Notices", "go to PYQs". Once
// resources exist in the database, this same palette gets a second
// CommandGroup that searches resource titles via TanStack Query,
// debounced as the person types. The open/close plumbing below
// doesn't change at all for that — only the groups inside do.
const DESTINATIONS = [
  { href: "/notes", label: "Notes & lab", icon: FileText },
  { href: "/pyqs", label: "PYQs", icon: HelpCircle },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/sancturm-updates", label: "Sancturm updates", icon: Sparkles },
  { href: "/ownership", label: "Ownership", icon: UserRound },
];

/**
 * The palette is a CONTROLLED component — open/onOpenChange are owned
 * by AppLayout, not by this file. That's what lets the sidebar's
 * "Search" button and the Ctrl+K keyboard shortcut open the exact
 * same dialog, instead of each having its own separate state.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: role } = useCurrentRole();
  const dashboardLabel = role?.type === "admin" ? "Controller's dashboard" : "CR dashboard";

  const goTo = useCallback(
    (href: string) => {
      router.push(href);
      onOpenChange(false);
    },
    [router, onOpenChange]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search Sancturm..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Sections">
          {DESTINATIONS.map((dest) => (
            <CommandItem key={dest.href} onSelect={() => goTo(dest.href)}>
              <dest.icon className="h-4 w-4 text-muted-foreground" />
              {dest.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="CR">
          <CommandItem onSelect={() => goTo("/cr")}>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            {dashboardLabel}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
