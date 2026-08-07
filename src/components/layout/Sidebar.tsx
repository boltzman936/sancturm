"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, HelpCircle, Megaphone, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";

import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/notes", label: "Notes & lab", icon: FileText },
  { href: "/pyqs", label: "PYQs", icon: HelpCircle },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/sancturm-updates", label: "Sancturm updates", icon: Sparkles },
  { href: "/ownership", label: "Ownership", icon: UserRound },
];

// Below md this renders as an off-canvas drawer (fixed, slides in over
// a backdrop, controlled by AppLayout's hamburger button); at md+ it's
// the same nav rendered inline instead, permanently visible — `open`
// and `onClose` are simply irrelevant there since the translate-x-0
// override always wins.
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: role } = useCurrentRole();
  // Anurag is the one admin account — everyone else with dashboard
  // access is a branch CR, so "CR dashboard" stays accurate for them.
  const dashboardLabel = role?.type === "admin" ? "Controller's dashboard" : "CR dashboard";

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <nav
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col gap-6 border-r border-border bg-background-secondary p-4 transition-transform duration-200 ease-out",
          "md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:transition-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={onClose}
            className="px-1 font-mono text-base font-medium text-terminal-blue transition-opacity hover:opacity-80"
          >
            sancturm
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <BranchSwitcher />

        <ul className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto">
          <Link
            href="/cr"
            onClick={onClose}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/cr")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            {dashboardLabel}
          </Link>
        </div>
      </nav>
    </>
  );
}
