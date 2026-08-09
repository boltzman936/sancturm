"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createNotice, createNoticeAllBranches } from "@/features/notices/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { titleFromFileName } from "@/features/uploads/titleFromFileName";
import { Select } from "@/components/shared/Select";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string };
type TermOption = { id: string; label: string };

export function NoticeComposer({
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
  // Only an admin gets to pick more than one branch — a CR is always
  // scoped to their own single branch (fixedBranchId), same rule as
  // CRUploadForm's canBulkPublish.
  isAdmin: boolean;
}) {
  const [branchId, setBranchId] = useState(fixedBranchId ?? branches[0]?.id ?? "");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    fixedBranchId ? [fixedBranchId] : branches[0] ? [branches[0].id] : []
  );
  const [termId, setTermId] = useState(fixedTermId ?? terms[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !termId) return;
    if (isAdmin ? selectedBranchIds.length === 0 : !branchId) return;
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
    const titleInput = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const title = titleInput || titleFromFileName(file.name);

    startTransition(async () => {
      setUploadProgress(0);
      try {
        // Straight to R2 from the browser — bypasses the serverless
        // body-size limit a large PDF would otherwise hit.
        const filePath = `notices/${isAdmin ? "multi-branch" : branchId}/${crypto.randomUUID()}-${file.name}`;
        const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress);

        const formData = new FormData();
        formData.set("termId", termId);
        formData.set("title", title);
        formData.set("fileUrl", fileUrl);

        if (isAdmin) {
          formData.set("branchIds", JSON.stringify(selectedBranchIds));
          await createNoticeAllBranches(formData);
        } else {
          formData.set("branchId", branchId);
          await createNotice(formData);
        }
        // revalidatePath (in the server action) refreshes server-rendered
        // pages, but /notices reads through TanStack Query's client
        // cache — that needs its own invalidation to show the new notice
        // without a manual refresh.
        queryClient.invalidateQueries({ queryKey: ["notices"] });
        setSuccess(true);
        formRef.current?.reset();
        setFile(null);
      } catch {
        setError("Something went wrong. Try again.");
      } finally {
        setUploadProgress(null);
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
          <label htmlFor="notice-term" className="font-mono text-xs text-subtle-foreground">
            Year
          </label>
          <Select
            id="notice-term"
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
          <label htmlFor="branch" className="font-mono text-xs text-subtle-foreground">
            Branch
          </label>
          <Select
            id="branch"
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
        <label htmlFor="title" className="font-mono text-xs text-subtle-foreground">
          Title <span className="normal-case text-subtle-foreground/70">(optional — defaults to file name)</span>
        </label>
        <input
          id="title"
          name="title"
          placeholder="e.g. Mid-semester exam schedule"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="file" className="font-mono text-xs text-subtle-foreground">
          PDF
        </label>
        <input
          id="file"
          type="file"
          accept="application/pdf"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>

      {uploadProgress !== null && <UploadProgress fraction={uploadProgress} />}

      <button
        type="submit"
        disabled={
          isPending || !file || !termId || (isAdmin ? selectedBranchIds.length === 0 : !branchId)
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
