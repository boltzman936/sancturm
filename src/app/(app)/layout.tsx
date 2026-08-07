"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Menu } from "lucide-react";
import { useBranch } from "@/hooks/useBranch";
import { useCommandPaletteShortcut } from "@/hooks/useCommandPaletteShortcut";
import { Sidebar } from "@/components/layout/Sidebar";
import { CommandPalette } from "@/components/layout/CommandPalette";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branch, isLoaded } = useBranch();

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
    if (isLoaded && !branch) {
      router.replace("/");
    }
  }, [isLoaded, branch, router]);

  if (!isLoaded || !branch) return null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between border-b border-border bg-background-secondary p-4 md:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-card active:bg-card hover:text-foreground active:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="font-mono text-lg font-medium text-terminal-blue transition-opacity hover:opacity-80 active:opacity-80">
          sancturm
        </Link>
        {/* Spacer matching the button's width so the wordmark stays
            visually centered instead of drifting toward the button. */}
        <span className="w-9" aria-hidden="true" />
      </header>

      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
