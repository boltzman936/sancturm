"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, HeartHandshake, HelpCircle, Megaphone, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";

import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { SpecializationSwitcher } from "@/components/layout/SpecializationSwitcher";
import { TermSwitcher } from "@/components/layout/TermSwitcher";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { Logo } from "@/components/layout/Logo";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBranchBySlug, useSpecializationBySlug } from "@/features/branches/queries";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { SignOutButton } from "@/lib/auth/SignOutButton";
import { useLatestNotice, useLastSeenNotice } from "@/features/notices/useLatestNotice";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/notes", label: "Notes & lab", icon: FileText },
  { href: "/pyqs", label: "PYQs", icon: HelpCircle },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/sancturm-updates", label: "Sancturm updates", icon: Sparkles },
  { href: "/support", label: "Support Sancturm", icon: HeartHandshake },
  { href: "/ownership", label: "Sancturm Team", icon: UserRound },
];

// Below md this renders as an off-canvas drawer (fixed, slides in over
// a backdrop, controlled by AppLayout's hamburger button); at md+ it's
// the same nav rendered inline instead, permanently visible — `open`
// and `onClose` are simply irrelevant there since the translate-x-0
// override always wins.
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { data: role } = useCurrentRole();
  const { branch } = useBranch();
  const { data: currentBranch } = useBranchBySlug(branch);
  const { specialization: specializationSlug } = useSpecialization();
  const { data: currentSpecialization } = useSpecializationBySlug(
    currentBranch?.has_specializations ? (currentBranch?.id ?? null) : null,
    specializationSlug
  );
  // Anurag is the one admin account — everyone else with dashboard
  // access is a branch CR, so "CR dashboard" stays accurate for them.
  const dashboardLabel = role?.type === "admin" ? "Controller's dashboard" : "CR dashboard";

  // Unread-notice red dot — see useLatestNotice's own comment for why
  // this is a separate, deliberately narrower query than the Notices
  // page's own useNotices(), and why it's scoped only to branch/
  // specialization, not term/batch.
  const specializationId = currentBranch?.has_specializations ? (currentSpecialization?.id ?? null) : null;
  const { data: latestNotice } = useLatestNotice(
    currentBranch?.id ?? null,
    specializationId,
    currentBranch?.has_specializations ?? false
  );
  const { lastSeenId } = useLastSeenNotice(currentBranch?.id ?? null, specializationId);
  const hasUnreadNotice = !!latestNotice && latestNotice.id !== lastSeenId;

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
          // 3 fixed-height zones stacked in a column: TOP and BOTTOM
          // are shrink-0 (their own content sizes them), MIDDLE is the
          // only one that grows and scrolls — see its own comment
          // below. min-h-0 here is what lets that middle child actually
          // shrink instead of forcing the whole nav taller than the
          // viewport (the classic flex-column overflow gotcha).
          "fixed left-0 top-0 z-50 flex h-dvh min-h-0 w-72 max-w-[85vw] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background transition-transform duration-200 ease-out",
          // md:sticky (not md:static) — static let the sidebar scroll
          // away with the page's own scroll, so a long resource list
          // meant scrolling all the way through it just to reach
          // "Controller's dashboard" / "Sign out" at the bottom of the
          // nav. Sticky-to-the-viewport-top plus self-start (so the
          // flex row doesn't stretch it to match main's full scroll
          // height) keeps it pinned in place instead.
          //
          // Width steps up across all three viewport tiers this
          // component is meant to feel native at: the mobile drawer
          // above uses its own w-72, md:w-56 is deliberately a touch
          // narrower than desktop's lg:w-64 — tablet's a mid-size
          // canvas where main content still wants the room — and both
          // stay fixed/stable within their own tier rather than
          // fluidly resizing.
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-56 md:max-w-none md:translate-x-0 md:self-start md:transition-none lg:w-64",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* TOP — logo + Year/Branch selectors. shrink-0 so a tall nav
            list below never compresses it; padding here is the one
            place that sets the sidebar's left/right inset, and the
            middle/bottom zones below match it exactly so logo,
            selectors, nav links and bottom actions all share one
            left/right edge. */}
        <div className="flex shrink-0 flex-col gap-4 p-4 md:gap-5 lg:p-5">
          {/* -mx-4/lg:-mx-5 cancels this row back out to the sidebar's
              TRUE edges (undoing the parent's own p-4/lg:p-5), so the
              two absolutely-positioned children below are each
              independently placed relative to the FULL sidebar width,
              not the already-inset content box — left-1/2 is real 50%,
              and right-6 is real ~24px from the true edge, neither one
              positioned relative to the other. h-8 gives both an
              explicit box to center within (position:absolute takes
              them out of flow, so the row has no other height source). */}
          <div className="relative -mx-4 h-8 lg:-mx-5">
            <Link
              href="/"
              onClick={onClose}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm px-1 outline-none transition-opacity hover:opacity-80 active:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo className="h-6 w-auto" />
            </Link>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="absolute right-6 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-sidebar-muted-foreground transition-colors hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:text-sidebar-foreground md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <TermSwitcher />
            <BranchSwitcher />
            {currentBranch?.has_specializations && <SpecializationSwitcher />}
          </div>
        </div>

        {/* MIDDLE — the nav links. The only zone that grows (flex-1)
            and the only one that scrolls (overflow-y-auto) once the
            viewport's too short for everything to fit — TOP and
            BOTTOM stay put, fully visible, exactly like a native app
            sidebar. min-h-0 is required alongside flex-1 for the
            scroll to ever actually kick in instead of the column just
            growing taller than the viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-5">
          <ul className="flex flex-col gap-1 py-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:py-2",
                      isActive
                        ? "bg-sidebar-active/15 text-sidebar-active"
                        : "text-sidebar-muted-foreground hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:text-sidebar-foreground"
                    )}
                  >
                    <span className="relative shrink-0">
                      <link.icon className="h-4 w-4" />
                      {/* Only ever rendered on the Notices link — see
                          hasUnreadNotice's own comment. Purely visual
                          (aria-hidden): the link's own accessible name
                          is still just "Notices", the dot doesn't need
                          its own label since it conveys no action of
                          its own. */}
                      {link.href === "/notices" && hasUnreadNotice && (
                        <span
                          aria-hidden="true"
                          className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                        />
                      )}
                    </span>
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* BOTTOM — dashboard link + sign out, grouped as one action
            cluster. shrink-0 keeps it fully visible above the edge at
            every viewport; the border reuses the same border-border
            token as the sidebar's own right edge and the selector
            buttons above, so the group reads as intentionally set off
            from the scrollable nav rather than just trailing
            whitespace. Bottom padding adds the device's safe-area
            inset (home indicator / gesture bar) on top of the normal
            padding instead of replacing it, so it's a no-op on
            desktop/tablet and only grows on devices that need it. */}
        <div className="shrink-0 border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-5">
          <div className="flex flex-col gap-3">
            <ThemeSwitcher />

            <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
              {/* justify-center: the dashboard link's icon+text center as
                  one group within the link's own full-width row (that
                  row already spans the sidebar's full content width, same
                  as every nav item above) — background/hover/active
                  colors are unaffected, only the inner content's
                  horizontal position changes. */}
              <Link
                href="/cr"
                onClick={onClose}
                className={cn(
                  "flex items-center justify-center gap-2.5 rounded-md px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring md:py-2",
                  pathname.startsWith("/cr")
                    ? "bg-sidebar-active/15 text-sidebar-active"
                    : "text-sidebar-muted-foreground hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:text-sidebar-foreground"
                )}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                {dashboardLabel}
              </Link>

              {/* Only shown once someone's actually signed in — a plain
                  student browsing anonymously has no session to end. This
                  is what lets a test login (or the previous CR, handing
                  a branch off) clear the way for the next person.
                  text-center: SignOutButton's own button element stretches
                  to the same full-width row as the link above it (flex-col
                  parent's default stretch), so centering its text lines it
                  up directly under the centered dashboard link. */}
              {role && <SignOutButton className="px-3 py-1 text-center text-sidebar-muted-foreground" />}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
