"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (signInError) {
      setError("Invalid email or password.");
      return;
    }

    // Same reasoning as SignOutButton's identical call — without this,
    // useCurrentRole() could keep serving a stale cached "signed out"
    // result for up to its 5-minute staleTime after a genuinely
    // successful sign-in.
    queryClient.invalidateQueries({ queryKey: ["current-role"] });
    // router.refresh() forces the /cr layout's Server Component to
    // re-check auth against the just-updated session cookie — without
    // it, the redirect can land before the server sees we're signed in.
    router.push("/cr");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <h1 className="text-xl font-medium text-foreground">CR login</h1>
          <p className="mt-1 text-sm text-muted-foreground">Students never need this page.</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="font-mono text-xs text-subtle-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="font-mono text-xs text-subtle-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {error && <p className="font-mono text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
