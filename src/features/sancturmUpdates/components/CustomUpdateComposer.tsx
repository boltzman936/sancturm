"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createCustomSancturmUpdate } from "@/features/sancturmUpdates/actions";
import { cn } from "@/lib/utils";

/** Text-only path — title + body typed directly, no PDF involved. */
export function CustomUpdateComposer() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value.trim();
    if (!title || !body) return;

    const formData = new FormData();
    formData.set("title", title);
    formData.set("body", body);

    startTransition(async () => {
      try {
        await createCustomSancturmUpdate(formData);
        queryClient.invalidateQueries({ queryKey: ["sancturm-updates"] });
        setSuccess(true);
        formRef.current?.reset();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="update-custom-title" className="font-mono text-xs text-subtle-foreground">
          Title
        </label>
        <input
          id="update-custom-title"
          name="title"
          required
          placeholder="e.g. Notes & Lab section revamped"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="update-custom-body" className="font-mono text-xs text-subtle-foreground">
          Update text
        </label>
        <textarea
          id="update-custom-body"
          name="body"
          required
          rows={5}
          placeholder="What changed, what's new, what's coming…"
          className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {isPending ? "Publishing…" : "Publish update"}
      </button>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          Published — it&apos;s already live, no review needed.
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
