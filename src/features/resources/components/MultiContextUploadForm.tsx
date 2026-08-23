"use client";

import { useRef, useState, useTransition } from "react";
import { useTerms } from "@/features/terms/queries";
import { useBatches } from "@/features/batches/queries";
import { useAllSpecializations } from "@/features/branches/queries";
import { useCanonicalSubjects } from "@/features/resources/queries";
import { uploadResourceDirectMultiContext, type MultiContextResult } from "@/features/resources/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { titleFromFileName, looksLikeMeaninglessName } from "@/features/uploads/titleFromFileName";
import { cn } from "@/lib/utils";

type BranchOption = { id: string; name: string; has_specializations: boolean };
type UploadType = "notes" | "lab_manual" | "pyq";

const SEMESTER_ORDINALS = [1, 2] as const;

/**
 * Anurag/admin only — publish ONE file across any combination of
 * Branch × Batch × Year × Semester × Specialization at once, instead
 * of repeating the same upload per combination. A deliberately
 * separate mini-form from CRUploadForm's existing single-branch bulk
 * flow (not a shared/entangled state tree) — that flow, and every CR
 * permission/option, stay completely untouched by this file existing.
 *
 * "Semester" here means 1st/2nd semester OF whichever Year(s) are
 * picked (Year 1+2 × Semester 1st+2nd = every term that currently
 * exists) — the only interpretation that stays meaningful as more
 * years get added, confirmed explicitly rather than assumed.
 */
export function MultiContextUploadForm({
  branches,
  resourceType,
}: {
  branches: BranchOption[];
  resourceType: UploadType;
}) {
  const { data: terms } = useTerms();
  const { data: batches } = useBatches();
  const { data: canonicalSubjects } = useCanonicalSubjects();
  const isPyq = resourceType === "pyq";
  const [pyqKind, setPyqKind] = useState<"pyq" | "pyq_solution">("pyq");

  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [yearNumbers, setYearNumbers] = useState<number[]>([]);
  const [semesterOrdinals, setSemesterOrdinals] = useState<(1 | 2)[]>([]);
  const [specializationIds, setSpecializationIds] = useState<string[]>([]);

  const [subjectValue, setSubjectValue] = useState(""); // canonical subject id (PYQ) or free-text name (Notes/Lab)
  const [titleValue, setTitleValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<MultiContextResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { data: allSpecializations } = useAllSpecializations();
  const distinctYears = Array.from(new Set((terms ?? []).map((t) => t.year_number))).sort((a, b) => a - b);
  const branchesWithSpecializations = branches.filter((b) => b.has_specializations && branchIds.includes(b.id));
  // Every specialization belonging to any CURRENTLY-SELECTED branch
  // that has them, filtered client-side from the one unscoped query
  // above (not one query per branch — that would mean a variable
  // number of hook calls across renders, which React's rules of hooks
  // don't allow) — each option labeled with its own branch so a multi-
  // branch selection stays unambiguous (e.g. "CSE — AIML").
  const specializationOptions = branchesWithSpecializations.flatMap((branch) =>
    (allSpecializations ?? [])
      .filter((s) => s.branch_id === branch.id)
      .map((s) => ({ id: s.id, name: `${branch.name} — ${s.name}` }))
  );
  const needsSpecializationPick = branchesWithSpecializations.length > 0;

  function toggleYear(year: number) {
    setYearNumbers((prev) => (prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]));
  }
  function toggleSemester(ord: 1 | 2) {
    setSemesterOrdinals((prev) => (prev.includes(ord) ? prev.filter((o) => o !== ord) : [...prev, ord]));
  }

  function fallbackTitle(f: File) {
    const fromFileName = titleFromFileName(f.name);
    if (!looksLikeMeaninglessName(fromFileName)) return fromFileName;
    const subjectLabel = isPyq
      ? canonicalSubjects?.find((s) => s.id === subjectValue)?.canonical_name
      : subjectValue || undefined;
    return subjectLabel ? `${subjectLabel} upload` : "Untitled upload";
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || branchIds.length === 0 || batchIds.length === 0 || yearNumbers.length === 0 || semesterOrdinals.length === 0) {
      return;
    }
    setError(null);
    setResult(null);

    const form = event.currentTarget;
    const description = (form.elements.namedItem("mc-description") as HTMLTextAreaElement).value;
    const title = titleValue.trim() || fallbackTitle(file);
    const section = isPyq ? "pyq" : "notes_lab";
    const resourceTypeToSend = isPyq ? pyqKind : resourceType;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    startTransition(async () => {
      try {
        const filePath = `multi-branch/${section}/${crypto.randomUUID()}-${file.name}`;
        const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress, controller.signal);

        const formData = new FormData();
        formData.set("branchIds", JSON.stringify(branchIds));
        formData.set("batchIds", JSON.stringify(batchIds));
        formData.set("yearNumbers", JSON.stringify(yearNumbers));
        formData.set("semesterOrdinals", JSON.stringify(semesterOrdinals));
        formData.set("specializationIds", JSON.stringify(needsSpecializationPick ? specializationIds : []));
        if (isPyq) {
          formData.set("canonicalSubjectId", subjectValue);
        } else {
          formData.set("subjectName", subjectValue);
        }
        formData.set("section", section);
        formData.set("resourceType", resourceTypeToSend);
        formData.set("title", title);
        formData.set("description", description);
        formData.set("fileUrl", fileUrl);

        const outcome = await uploadResourceDirectMultiContext(formData);
        setResult(outcome);
        formRef.current?.reset();
        setFile(null);
        setTitleValue("");
      } catch (err) {
        const cancelled = err instanceof DOMException && err.name === "AbortError";
        setError(cancelled ? "Cancelled." : err instanceof Error ? err.message : "Something went wrong. Try again.");
      } finally {
        setUploadProgress(null);
        abortControllerRef.current = null;
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4"
    >
      <p className="font-mono text-xs text-subtle-foreground">
        Publish one file to any combination of Branch × Batch × Year × Semester
        {needsSpecializationPick ? " × Specialization" : ""} at once.
      </p>

      {isPyq && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Kind</label>
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
            {(["pyq", "pyq_solution"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setPyqKind(kind)}
                className={cn(
                  "min-w-[8rem] flex-1 rounded px-3 py-1.5 text-sm transition-colors",
                  pyqKind === kind
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {kind === "pyq" ? "Question paper" : "Solution"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Branch</label>
          <BranchMultiSelect
            branches={branches}
            selectedBranchIds={branchIds}
            itemLabel="branch"
            itemLabelPlural="branches"
            onChange={(ids) => {
              setBranchIds(ids);
              setSpecializationIds((prev) => prev.filter((id) => specializationOptions.some((o) => o.id === id)));
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Batch</label>
          <BranchMultiSelect
            branches={(batches ?? []).map((b) => ({ id: b.id, name: b.label }))}
            selectedBranchIds={batchIds}
            itemLabel="batch"
            itemLabelPlural="batches"
            onChange={setBatchIds}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Year</label>
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
            {distinctYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => toggleYear(year)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm transition-colors",
                  yearNumbers.includes(year)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                Year {year}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Semester</label>
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
            {SEMESTER_ORDINALS.map((ord) => (
              <button
                key={ord}
                type="button"
                onClick={() => toggleSemester(ord)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm transition-colors",
                  semesterOrdinals.includes(ord)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {ord === 1 ? "1st Semester" : "2nd Semester"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {needsSpecializationPick && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Specialization</label>
          <BranchMultiSelect
            branches={specializationOptions}
            selectedBranchIds={specializationIds}
            itemLabel="specialization"
            itemLabelPlural="specializations"
            onChange={setSpecializationIds}
          />
          <p className="font-mono text-xs text-subtle-foreground/70">
            A selected branch with no specialization checked here is skipped entirely.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="mc-title" className="font-mono text-xs text-subtle-foreground">
          Title <span className="normal-case text-subtle-foreground/70">(optional — defaults to file name)</span>
        </label>
        <input
          id="mc-title"
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mc-subject" className="font-mono text-xs text-subtle-foreground">
          Subject
        </label>
        {isPyq ? (
          <select
            id="mc-subject"
            value={subjectValue}
            onChange={(event) => setSubjectValue(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a subject…</option>
            {canonicalSubjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.canonical_name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="mc-subject"
            value={subjectValue}
            onChange={(event) => setSubjectValue(event.target.value)}
            placeholder="Leave blank for Extra — matched by exact name per branch"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mc-description" className="font-mono text-xs text-subtle-foreground">
          Description (optional)
        </label>
        <textarea
          id="mc-description"
          name="mc-description"
          rows={2}
          className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mc-file" className="font-mono text-xs text-subtle-foreground">
          File
        </label>
        <input
          id="mc-file"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>

      {uploadProgress !== null && <UploadProgress fraction={uploadProgress} label="Uploading" />}

      <button
        type="submit"
        disabled={
          isPending ||
          !file ||
          branchIds.length === 0 ||
          batchIds.length === 0 ||
          yearNumbers.length === 0 ||
          semesterOrdinals.length === 0
        }
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Publishing…" : "Publish to every selected combination"}
      </button>

      {result && (
        <div className="flex flex-col gap-1 font-mono text-xs">
          <p className="text-terminal-blue">
            Published to {result.published} context{result.published === 1 ? "" : "s"}
            {result.skipped.length > 0 ? ` — ${result.skipped.length} skipped.` : "."}
          </p>
          {result.skipped.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-subtle-foreground">
              {result.skipped.slice(0, 8).map((s, i) => (
                <li key={i}>
                  Branch {s.branchId.slice(0, 8)}… / Term {s.termId.slice(0, 8)}… / Batch {s.batchId.slice(0, 8)}… —{" "}
                  {s.reason}
                </li>
              ))}
              {result.skipped.length > 8 && <li>…and {result.skipped.length - 8} more.</li>}
            </ul>
          )}
        </div>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
