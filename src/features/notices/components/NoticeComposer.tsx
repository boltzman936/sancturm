"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createNotice, createNoticeAllBranches } from "@/features/notices/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { titleFromFileName } from "@/features/uploads/titleFromFileName";
import { Select } from "@/components/shared/Select";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { TermMultiSelect } from "@/components/shared/TermMultiSelect";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string };
type TermOption = { id: string; label: string };

export function NoticeComposer({
  branches,
  terms,
  fixedBranchId,
  fixedTermId,
  fixedBatchId,
  isAdmin,
}: {
  branches: BranchOption[];
  terms: TermOption[];
  fixedBranchId?: string;
  fixedTermId?: string;
  // A CR's batch is fixed to their own cr_profile (always set for a
  // CR) — admin's bulk-publish path resolves the current batch per
  // selected year server-side instead (see createNoticeAllBranches),
  // since there's no practical way to ask "which batch, for each of
  // several years" in this form.
  fixedBatchId?: string;
  // Only an admin gets to pick more than one branch OR more than one
  // year — a CR is always scoped to their own single branch/term
  // (fixedBranchId/fixedTermId), same rule as CRUploadForm's
  // canBulkPublish.
  isAdmin: boolean;
}) {
  const [branchId, setBranchId] = useState(fixedBranchId ?? branches[0]?.id ?? "");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    fixedBranchId ? [fixedBranchId] : branches[0] ? [branches[0].id] : []
  );
  const [termId, setTermId] = useState(fixedTermId ?? terms[0]?.id ?? "");
  const [selectedTermIds, setSelectedTermIds] = useState<string[]>(
    fixedTermId ? [fixedTermId] : terms[0] ? [terms[0].id] : []
  );
  const [file, setFile] = useState<File | null>(null);
  // Admin-only — the checkbox itself only renders for isAdmin, and the
  // server action only ever reads this field on the admin-only bulk-
  // publish path, so a CR has no way to set this true either way.
  const [crOnly, setCrOnly] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    if (isAdmin ? selectedTermIds.length === 0 : !termId) return;
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
        formData.set("title", title);
        formData.set("fileUrl", fileUrl);

        if (isAdmin) {
          formData.set("termIds", JSON.stringify(selectedTermIds));
          formData.set("branchIds", JSON.stringify(selectedBranchIds));
          formData.set("crOnly", String(crOnly));
          await createNoticeAllBranches(formData);
        } else {
          formData.set("termId", termId);
          formData.set("batchId", fixedBatchId!);
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
        setCrOnly(false);
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
      {isAdmin ? (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Year</label>
          <TermMultiSelect terms={terms} selectedTermIds={selectedTermIds} onChange={setSelectedTermIds} />
        </div>
      ) : (
        !fixedTermId && (
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
              {/* Full label, not truncated — see CRUploadForm's
                  identical comment (a year can have more than one
                  semester now). */}
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.label}
                </option>
              ))}
            </Select>
          </div>
        )
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

      {isAdmin && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={crOnly}
            onChange={(event) => setCrOnly(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Notice for CR only
          <span className="font-mono text-xs normal-case text-subtle-foreground/70">
            (hidden from students, visible to CR/admin)
          </span>
        </label>
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
          isPending ||
          !file ||
          (isAdmin ? selectedTermIds.length === 0 : !termId) ||
          (isAdmin ? selectedBranchIds.length === 0 : !branchId)
        }
        className={cn(
          "self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {isPending
          ? "Publishing…"
          : isAdmin && (selectedBranchIds.length > 1 || selectedTermIds.length > 1)
            ? `Publish to ${selectedTermIds.length} year${selectedTermIds.length > 1 ? "s" : ""} × ${selectedBranchIds.length} branch${selectedBranchIds.length > 1 ? "es" : ""}`
            : "Publish notice"}
      </button>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          {isAdmin && (selectedBranchIds.length > 1 || selectedTermIds.length > 1)
            ? "Published to every selected year and branch — already live, no review needed."
            : "Published — it's already live, no review needed."}
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
