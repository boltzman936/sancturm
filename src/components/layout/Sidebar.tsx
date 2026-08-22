"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, animate, useMotionValue, type PanInfo } from "framer-motion";
import { FileText, HeartHandshake, HelpCircle, Megaphone, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";

import { BranchSwitcher } from "@/components/layout/BranchSwitcher";
import { SpecializationSwitcher } from "@/components/layout/SpecializationSwitcher";
import { TermSwitcher } from "@/components/layout/TermSwitcher";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { Logo } from "@/components/layout/Logo";
import { useBranch } from "@/hooks/useBranch";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useTerm } from "@/hooks/useTerm";
import { useIsMobileDrawer } from "@/hooks/useIsMobileDrawer";
import { useBranchBySlug, useSpecializationBySlug } from "@/features/branches/queries";
import { useTermBySlug } from "@/features/terms/queries";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { SignOutButton } from "@/lib/auth/SignOutButton";
import { useLatestNotice, useLastSeenNotice } from "@/features/notices/useLatestNotice";
import { useCurrentNoticeTermId } from "@/features/notices/currentSemester";
import { cn } from "@/lib/utils";

// Tailwind's own w-72 (18rem) — the drawer's un-clamped width, used as
// the very first paint's drag math before the ResizeObserver below has
// measured the REAL rendered width (which max-w-[85vw] can cap
// narrower on small phones). Wrong for exactly one frame on a narrow
// phone, self-corrects immediately once the observer fires.
const DEFAULT_SIDEBAR_WIDTH_PX = 288;
// How far (as a fraction of the drawer's own width) a drag has to
// travel before releasing it commits to the opposite state, when it's
// NOT a fast flick — a plain tap or a small accidental thumb-brush
// near the edge stays well under this and springs back to where it
// started instead of toggling the drawer.
const COMMIT_DISTANCE_RATIO = 0.35;
// A flick faster than this (px/s) commits regardless of how far it
// travelled — matches how native iOS/Android drawers read "a fast
// flick" as intent even from a short gesture.
const COMMIT_VELOCITY_PX_PER_S = 500;
// Framer Motion's own transition config, shared by every snap (drag
// release AND programmatic open/close alike, so a hamburger-button tap
// and a finger-release settle with the identical feel) — a quick
// ease-out, not a spring, so it never overshoots/bounces past the
// resting position.
const SNAP_TRANSITION = { type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] } as const;

const NAV_LINKS = [
  { href: "/notes", label: "Notes & lab", icon: FileText },
  { href: "/pyqs", label: "PYQs", icon: HelpCircle },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/sancturm-updates", label: "Sancturm updates", icon: Sparkles },
  { href: "/support", label: "Support Sancturm", icon: HeartHandshake },
  { href: "/ownership", label: "Sancturm Team", icon: UserRound },
];

// Below md this renders as an off-canvas drawer (fixed, slides in over
// a backdrop, controlled by AppLayout's hamburger button, and now also
// draggable — swipe from the left edge to open, swipe the open drawer
// back to close); at md+ it's the same nav rendered inline instead,
// permanently visible — `open`/`onOpen`/`onClose` are simply irrelevant
// there since the CSS-only md:translate-x-0 override always wins and
// none of the drag wiring below is even attached (see isMobileDrawer).
export function Sidebar({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const pathname = usePathname();
  const isMobileDrawer = useIsMobileDrawer();
  const navRef = useRef<HTMLElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH_PX);
  // Single source of truth for the drawer's horizontal position while
  // it's a drawer — bound to the nav's `style.x` below so a drag (which
  // updates this value directly, every frame, via Framer Motion's own
  // gesture handling, not React state/re-renders) visually moves the
  // real element with zero extra latency. Programmatic opens/closes
  // (hamburger tap, a nav link's onClose, browser back/forward) instead
  // animate it via the effect further down, through the exact same
  // motion value, so a tap and a finger-release settle identically.
  const x = useMotionValue(open ? 0 : -DEFAULT_SIDEBAR_WIDTH_PX);
  // Distinguishes "the drag itself already committed open/closed and
  // animated x there" from "`open` changed for some external reason
  // and x now needs to catch up" — without this, the sync effect below
  // would immediately re-animate x right after a drag's own release
  // animation, fighting it for one frame.
  const isDragCommittedRef = useRef(false);

  // max-w-[85vw] can cap the drawer narrower than its own w-72 on a
  // small phone — this keeps the drag math (constraints, commit
  // distance, the closed resting position) matched to the REAL
  // rendered width instead of the w-72 fallback.
  useEffect(() => {
    const el = navRef.current;
    if (!el || !isMobileDrawer) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSidebarWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobileDrawer]);

  useEffect(() => {
    if (!isMobileDrawer || isDragCommittedRef.current) {
      isDragCommittedRef.current = false;
      return;
    }
    const controls = animate(x, open ? 0 : -sidebarWidth, SNAP_TRANSITION);
    return () => controls.stop();
  }, [open, sidebarWidth, isMobileDrawer, x]);

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    const distance = info.offset.x;
    const velocity = info.velocity.x;
    const shouldOpen = open
      ? !(distance < -sidebarWidth * COMMIT_DISTANCE_RATIO || velocity < -COMMIT_VELOCITY_PX_PER_S)
      : distance > sidebarWidth * COMMIT_DISTANCE_RATIO || velocity > COMMIT_VELOCITY_PX_PER_S;
    isDragCommittedRef.current = true;
    animate(x, shouldOpen ? 0 : -sidebarWidth, SNAP_TRANSITION);
    if (shouldOpen && !open) onOpen();
    else if (!shouldOpen && open) onClose();
  }
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

  // Unread-notice red dot — same (branch, specialization, current
  // Notice term) scope the Notices page itself uses, resolved through
  // the exact same hardcoded map (see currentSemester.ts) so the dot
  // can never light up for a context the page wouldn't actually show.
  const specializationId = currentBranch?.has_specializations ? (currentSpecialization?.id ?? null) : null;
  const { term: sidebarTermSlug } = useTerm();
  const { data: sidebarTerm } = useTermBySlug(sidebarTermSlug);
  const liveTermId = useCurrentNoticeTermId(sidebarTerm?.year_number);
  const { data: latestNotice } = useLatestNotice(
    currentBranch?.id ?? null,
    specializationId,
    currentBranch?.has_specializations ?? false,
    liveTermId ?? null
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

      {/* Edge-swipe-to-open hot zone — only exists while the drawer is
          closed, so it never sits on top of (and steal taps from) the
          drawer's own content once open. A plain, narrow strip pinned
          to the true left edge: this is the only thing a finger
          starting there can actually touch, since the closed drawer
          itself is translated fully off-screen and can't receive that
          touch directly. Dragging this strip doesn't move the strip —
          it writes straight into the same `x` motion value the real
          drawer's transform is bound to below, so the drawer visually
          tracks the finger 1:1 even though the touch never lands on
          the drawer element itself. touch-pan-y (not touch-none) is
          what leaves ordinary vertical scrolling alone — Framer's own
          drag="x" gesture recognizer already releases a mostly-vertical
          touch back to the browser instead of capturing it, and this
          CSS property is the same promise made explicit for the
          browser's own scroll-vs-gesture arbitration on first touch. */}
      {isMobileDrawer && !open && (
        <motion.div
          aria-hidden="true"
          drag="x"
          dragConstraints={{ left: 0, right: sidebarWidth }}
          dragElastic={0}
          dragMomentum={false}
          // The strip's own visible position is never meant to reflect
          // the gesture (only the real drawer's `x`, updated in onDrag
          // below, should move) — dragSnapToOrigin makes Framer
          // animate the strip straight back to its resting x:0 the
          // instant a drag ends, every time, regardless of whether the
          // drawer opened. Without this it would otherwise just stay
          // wherever the finger let go, left behind as a dead
          // invisible strip sitting mid-page over real content.
          dragSnapToOrigin
          onDrag={(_event, info) => x.set(Math.min(0, -sidebarWidth + info.offset.x))}
          onDragEnd={handleDragEnd}
          // z-[60], one above the drawer's own z-50 — while closed, the
          // drawer still sits at translateX(-sidebarWidth), which
          // leaves a hairline sliver of its own (otherwise-inert) hit
          // area right at the true edge, directly overlapping this
          // strip. At equal z-index that sliver — being later in DOM
          // order — would win ties and swallow the touch meant for
          // this strip; the explicit higher stacking context makes
          // sure the strip always receives it instead.
          className="fixed inset-y-0 left-0 z-[60] w-5 touch-pan-y"
        />
      )}

      <motion.nav
        ref={navRef}
        drag={isMobileDrawer ? "x" : false}
        dragConstraints={{ left: -sidebarWidth, right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={isMobileDrawer ? { x } : undefined}
        className={cn(
          // 3 fixed-height zones stacked in a column: TOP and BOTTOM
          // are shrink-0 (their own content sizes them), MIDDLE is the
          // only one that grows and scrolls — see its own comment
          // below. min-h-0 here is what lets that middle child actually
          // shrink instead of forcing the whole nav taller than the
          // viewport (the classic flex-column overflow gotcha).
          //
          // No CSS transition-transform here (unlike before) — once
          // isMobileDrawer is true, `x` is driven either by an active
          // drag (Framer updates it every frame directly, no
          // transition wanted, it must track the finger exactly) or by
          // the animate() snap in the effect above (which supplies its
          // own JS-driven easing). A CSS transition on the same
          // property would fight that frame-by-frame, reading as
          // stutter instead of one smooth motion.
          "fixed left-0 top-0 z-50 flex h-dvh min-h-0 w-72 max-w-[85vw] shrink-0 touch-pan-y flex-col border-r border-sidebar-border bg-sidebar-background",
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
          // fluidly resizing. md:translate-x-0 also still matters here
          // even though `style.x` no longer drives desktop's position
          // (it's gated to isMobileDrawer): it's what the very first
          // server-rendered paint and any pre-hydration frame show,
          // before the isMobileDrawer effect has resolved.
          "md:sticky md:top-0 md:z-auto md:h-dvh md:w-56 md:max-w-none md:translate-x-0 md:self-start lg:w-64",
          !isMobileDrawer && (open ? "translate-x-0" : "-translate-x-full")
        )}
      >
        {/* TOP — logo + Year/Branch selectors. shrink-0 so a tall nav
            list below never compresses it; padding here is the one
            place that sets the sidebar's left/right inset, and the
            middle/bottom zones below match it exactly so logo,
            selectors, nav links and bottom actions all share one
            left/right edge. */}
        <div className="flex shrink-0 flex-col gap-3 p-3 md:gap-4 lg:p-4">
          {/* -mx-4/lg:-mx-5 cancels this row back out to the sidebar's
              TRUE edges (undoing the parent's own p-4/lg:p-5), so the
              two absolutely-positioned children below are each
              independently placed relative to the FULL sidebar width,
              not the already-inset content box — left-1/2 is real 50%,
              and right-6 is real ~24px from the true edge, neither one
              positioned relative to the other. h-8 gives both an
              explicit box to center within (position:absolute takes
              them out of flow, so the row has no other height source). */}
          <div className="relative -mx-3 h-9 lg:-mx-4">
            <Link
              href="/?cockpit=1"
              onClick={onClose}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm px-1 outline-none transition-opacity hover:opacity-80 active:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo surface="sidebar" />
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
        <div className="min-h-0 flex-1 overflow-y-auto px-3 lg:px-4">
          <ul className="flex flex-col gap-0.5 py-1">
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
        <div className="shrink-0 border-t border-sidebar-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:p-4">
          <div className="flex flex-col gap-2.5">
            <ThemeSwitcher />

            <div className="flex flex-col gap-0.5 border-t border-sidebar-border pt-2.5">
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
                  "flex items-center justify-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
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
      </motion.nav>
    </>
  );
}
