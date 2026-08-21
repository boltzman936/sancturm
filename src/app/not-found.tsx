import Link from "next/link";
import { FileQuestion } from "lucide-react";

// Root not-found.tsx — catches any URL that doesn't match a real route
// (a typo, an old bookmark, a dead link). Without this, Next falls
// back to its own bare, unstyled default 404 — no Sancturm branding,
// no way back into the app. Renders under the root layout (fonts,
// theme script, Providers already applied there), same token-based
// styling as (app)/error.tsx, but deliberately doesn't assume a
// branch/term is selected — a 404 can happen before onboarding too.
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">
        <FileQuestion className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium text-foreground">Page not found</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          This page doesn&apos;t exist, or the link is out of date.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90"
      >
        Back to Sancturm
      </Link>
    </div>
  );
}
