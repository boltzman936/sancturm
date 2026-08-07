"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSancturmUpdate } from "@/features/sancturmUpdates/actions";
import { cn } from "@/lib/utils";

export function UpdateComposer() {
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    if (!title) return;

    const formData = new FormData();
    formData.set("title", title);
    formData.set("file", file);

    startTransition(async () => {
      try {
        await createSancturmUpdate(formData);
        queryClient.invalidateQueries({ queryKey: ["sancturm-updates"] });
        setSuccess(true);
        formRef.current?.reset();
        setFile(null);
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
        <label htmlFor="update-title" className="font-mono text-xs text-subtle-foreground">
          Title
        </label>
        <input
          id="update-title"
          name="title"
          required
          placeholder="e.g. Notes & Lab section revamped"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="update-file" className="font-mono text-xs text-subtle-foreground">
          PDF
        </label>
        <input
          id="update-file"
          type="file"
          accept="application/pdf"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !file}
        className={cn(
          "self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
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
