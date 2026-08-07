"use client";

import { useEffect } from "react";

/**
 * Listens for Ctrl+K / Cmd+K anywhere on the page and calls onTrigger.
 * Kept separate from the palette's UI (CommandPalette.tsx) so a visible
 * "Search" button in the sidebar can open the exact same palette —
 * both just call the same setOpen(true) function.
 */
export function useCommandPaletteShortcut(onTrigger: () => void) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onTrigger();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onTrigger]);
}
