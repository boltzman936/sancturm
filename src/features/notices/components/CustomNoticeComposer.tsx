"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createCustomNotice, createCustomNoticeAllBranches } from "@/features/notices/actions";
import { Select } from "@/components/shared/Select";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string };
type TermOption = { id: string; label: string };

/** Text-only path — title + body typed directly, no PDF involved. */
export function CustomNoticeComposer({
  branches,
  terms,
  fixedBranchId,
  fixedTermId,
  isAdmin,
}: {
  branches: BranchOption[];
  terms: TermOption[];
  fixedBranchId?: string;
  fixedTermId?: string;
  // Same rule as NoticeComposer: only an admin can pick more than one
  // branch — a CR is always scoped to their own (fixedBranchId).
  isAdmin: boolean;
}) {
  const [branchId, setBranchId] = useState(fixedBranchId ?? branches[0]?.id ?? "");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    fixedBranchId ? [fixedBranchId] : branches[0] ? [branches[0].id] : []
  );
  const [termId, setTermId] = useState(fixedTermId ?? terms[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termId) return;
    if (isAdmin ? selectedBranchIds.length === 0 : !branchId) return;
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement).value.trim();
    if (!title || !body) return;

    const formData = new FormData();
    formData.set("termId", termId);
    formData.set("title", title);
    formData.set("body", body);

    startTransition(async () => {
      try {
        if (isAdmin) {
          formData.set("branchIds", JSON.stringify(selectedBranchIds));
          await createCustomNoticeAllBranches(formData);
        } else {
          formData.set("branchId", branchId);
          await createCustomNotice(formData);
        }
        queryClient.invalidateQueries({ queryKey: ["notices"] });
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
      {!fixedTermId && (
        <div className="flex flex-col gap-1">
          <label htmlFor="custom-notice-term" className="font-mono text-xs text-subtle-foreground">
            Year
          </label>
          <Select
            id="custom-notice-term"
            value={termId}
            onChange={(event) => setTermId(event.target.value)}
            className="bg-background"
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.label.split(" - ")[0]}
              </option>
            ))}
          </Select>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Branch</label>
          <BranchMultiSelect
            branches={branches}
            selectedBranchIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
          />
        </div>
      )}
      {!isAdmin && branches.length > 1 && !fixedBranchId && (
        <div className="flex flex-col gap-1">
          <label htmlFor="custom-branch" className="font-mono text-xs text-subtle-foreground">
            Branch
          </label>
          <Select
            id="custom-branch"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="bg-background"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="custom-title" className="font-mono text-xs text-subtle-foreground">
          Title
        </label>
        <input
          id="custom-title"
          name="title"
          required
          placeholder="e.g. Mid-semester exam schedule"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="custom-body" className="font-mono text-xs text-subtle-foreground">
          Notice text
        </label>
        <textarea
          id="custom-body"
          name="body"
          required
          rows={5}
          placeholder="Type the notice content here…"
          className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={
          isPending || !termId || (isAdmin ? selectedBranchIds.length === 0 : !branchId)
        }
        className={cn(
          "self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {isPending
          ? "Publishing…"
          : isAdmin && selectedBranchIds.length > 1
            ? `Publish to ${selectedBranchIds.length} branches`
            : "Publish notice"}
      </button>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          {isAdmin && selectedBranchIds.length > 1
            ? "Published to every selected branch — already live, no review needed."
            : "Published — it's already live, no review needed."}
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
