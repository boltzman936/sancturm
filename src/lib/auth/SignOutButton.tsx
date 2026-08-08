"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Lets whoever's currently signed in (a CR testing their own account,
 * or the previous CR before they hand the branch off) get back to a
 * clean /login screen for the next person — there was no way to do
 * this before, so a signed-in session on a shared/test device just
 * stuck around indefinitely.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // Same reasoning as login's router.refresh(): the (app)/cr layout's
    // Server Component check needs to see the now-cleared session
    // cookie, not just a client-side route change.
    router.push("/login");
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
