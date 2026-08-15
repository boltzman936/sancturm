"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Clears the CR/admin session and drops back into the regular app
 * (same as any other visitor) instead of a login wall — signing out
 * doesn't imply someone else is about to log in on this device, so
 * there's nothing to hand off to a login screen for. Whoever wants to
 * sign back in can do that from the CR dashboard link like normal.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // router.refresh() only re-runs Server Components on the current
    // route — it doesn't touch TanStack Query's client-side cache, so
    // without this, useCurrentRole() (the Sidebar's "Sign out"/
    // dashboard-link check) kept serving its stale 5-minute cached
    // role and showed CR-only UI for up to 5 minutes after actually
    // signing out.
    queryClient.invalidateQueries({ queryKey: ["current-role"] });
    // Same reasoning as login's router.refresh(): the (app)/cr layout's
    // Server Component check needs to see the now-cleared session
    // cookie, not just a client-side route change.
    router.push("/notes");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      className={cn(
        "font-mono text-xs text-subtle-foreground transition-colors hover:text-destructive active:text-destructive disabled:pointer-events-none disabled:opacity-50",
        className
      )}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
