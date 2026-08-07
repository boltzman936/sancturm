"use client";

import { useRef, useState } from "react";
import { useSubjects, useUploadResource } from "@/features/resources/queries";
import { cn } from "@/lib/utils";

export function UploadPyqForm({ branchId }: { branchId: string }) {
  const { data: subjects } = useSubjects(branchId);
  const upload = useUploadResource();
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = event.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const subjectId = (form.elements.namedItem("subject") as HTMLSelectElement).value || null;
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
    if (!title) return;

    upload.mutate(
      {
        branchId,
        subjectId,
        section: "pyq",
        resourceType: "pdf",
        title,
        description,
        file,
      },
      {
        onSuccess: () => {
          formRef.current?.reset();
          setFile(null);
        },
      }
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="font-mono text-xs text-subtle-foreground">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="subject" className="font-mono text-xs text-subtle-foreground">
          Subject
        </label>
        <select
          id="subject"
          name="subject"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Extra</option>
          {subjects?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="font-mono text-xs text-subtle-foreground">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="font-mono text-xs text-subtle-foreground">
          File
        </label>
        <input
          id="file"
          type="file"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>

      <button
        type="submit"
        disabled={upload.isPending || !file}
        className={cn(
          "self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {upload.isPending ? "Uploading…" : "Submit for review"}
      </button>

      {upload.isSuccess && (
        <p className="font-mono text-xs text-terminal-blue">
          Submitted — any branch&apos;s CR/admin can review it before it appears here.
        </p>
      )}
      {upload.isError && (
        <p className="font-mono text-xs text-destructive">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
