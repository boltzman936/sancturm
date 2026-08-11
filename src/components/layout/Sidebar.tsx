"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, HelpCircle, Megaphone, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";

import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { TermSwitcher } from "@/components/layout/TermSwitcher";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { SignOutButton } from "@/lib/auth/SignOutButton";
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
          // h-dvh, not inset-0's implicit height-via-top/bottom-0 —
          // Android Chrome's URL bar collapsing on scroll grows the
          // visual viewport, and fixed elements sized off top-0/
          // bottom-0 don't reliably track that resize, leaving a gap
          // at the bottom where the page shows through undimmed. dvh
          // (dynamic viewport height) is the unit built for this.
          className="fixed inset-x-0 top-0 z-40 h-dvh bg-black/60 md:hidden"
        />
      )}

      <nav
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh w-72 max-w-[85vw] shrink-0 flex-col gap-6 border-r border-border bg-background-secondary p-4 transition-transform duration-200 ease-out",
          // md:sticky (not md:static) — static let the sidebar scroll
          // away with the page's own scroll, so a long resource list
          // meant scrolling all the way through it just to reach
          // "Controller's dashboard" / "Sign out" at the bottom of the
          // nav. Sticky-to-the-viewport-top plus self-start (so the
          // flex row doesn't stretch it to match main's full scroll
          // height) keeps it pinned in place instead. Its own h-dvh +
          // overflow-y-auto is a fallback for a short viewport where
          // even the sidebar's own content wouldn't otherwise fit.
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-60 md:max-w-none md:translate-x-0 md:self-start md:overflow-y-auto md:transition-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={onClose}
            className="rounded-sm px-1 font-mono text-base font-medium text-terminal-blue outline-none transition-opacity hover:opacity-80 active:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            sancturm
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-card active:bg-card hover:text-foreground active:text-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <TermSwitcher />
          <BranchSwitcher />
        </div>

        <ul className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-card active:bg-card hover:text-foreground active:text-foreground"
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-col gap-1">
          <Link
            href="/cr"
            onClick={onClose}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              pathname.startsWith("/cr")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-card active:bg-card hover:text-foreground active:text-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            {dashboardLabel}
          </Link>

          {/* Only shown once someone's actually signed in — a plain
              student browsing anonymously has no session to end. This
              is what lets a test login (or the previous CR, handing
              a branch off) clear the way for the next person. */}
          {role && <SignOutButton className="px-3 py-1" />}
        </div>
      </nav>
    </>
  );
}
