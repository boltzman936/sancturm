"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Menu } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useTerm } from "@/hooks/useTerm";
import { useCommandPaletteShortcut } from "@/hooks/useCommandPaletteShortcut";
import { Sidebar } from "@/components/layout/Sidebar";
import { Logo } from "@/components/layout/Logo";

// Dynamically imported (not a top-level import) — cmdk's own JS isn't
// needed until someone actually opens the palette (Ctrl+K or the
// sidebar's Search button), but a plain top-level import ships it in
// this layout's own chunk, which loads on every single navigation
// under (app). ssr: false because the palette is a client-only
// overlay (nothing here has SEO/content value to render server-side).
const CommandPalette = dynamic(
  () => import("@/components/layout/CommandPalette").then((mod) => mod.CommandPalette),
  { ssr: false }
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branch, isLoaded: branchLoaded } = useBranch();
  const { term, isLoaded: termLoaded } = useTerm();
  const isLoaded = branchLoaded && termLoaded;

  // Owned here, not inside CommandPalette — the Ctrl+K shortcut opens
  // this dialog. See useCommandPaletteShortcut.ts for why.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  useCommandPaletteShortcut(openPalette);

  // Below md, Sidebar renders as an off-canvas drawer instead of a
  // permanent column — this is the toggle for it. Any navigation
  // (a link click inside Sidebar already calls onClose, but this
  // covers back/forward and anything else) closes it automatically.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to the router's pathname, an external system
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isLoaded && (!branch || !term)) {
      router.replace("/");
    }
  }, [isLoaded, branch, term, router]);

  if (!isLoaded || !branch || !term) return null;

  return (
    // min-h-dvh, not min-h-screen (static 100vh) — Android Chrome
    // recalculates 100vh as its URL bar hides/shows mid-scroll, which
    // reflows this whole flex-col column while the gesture is still
    // happening. That transient reflow was reaching the header's flex
    // row and, for a frame or two, visibly compressing the hamburger
    // button below its intended box — an SVG icon scales non-uniformly
    // when its container is squeezed even slightly, which is what
    // read as "shrinking/distorting". dvh tracks the real, current
    // viewport instead of recalculating against a moving target.
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="flex shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar-background p-4 md:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          // Fixed h-9 w-9 box (not padding-driven sizing) plus shrink-0
          // on every flex child in this row — belt-and-suspenders on
          // top of the dvh fix above, so this button's box can never
          // be squeezed by anything upstream, ever, regardless of
          // cause.
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground transition-colors hover:bg-sidebar-foreground/10 active:bg-sidebar-foreground/10 hover:text-sidebar-foreground active:text-sidebar-foreground"
        >
          <Menu className="h-5 w-5 shrink-0" />
        </button>
        <Link href="/" className="shrink-0 transition-opacity hover:opacity-80 active:opacity-80">
          <Logo className="h-8 w-auto" />
        </Link>
        {/* Spacer matching the button's width so the wordmark stays
            visually centered instead of drifting toward the button. */}
        <span className="h-9 w-9 shrink-0" aria-hidden="true" />
      </header>

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
