"use client";

import { useRef, useState, useTransition } from "react";
import { useSubjects } from "@/features/resources/queries";
import { uploadResourceDirect, uploadResourceDirectAllBranches } from "@/features/resources/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { LAB_SUBJECT_SLUGS, LAB_ONLY_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { titleFromFileName } from "@/features/uploads/titleFromFileName";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { NoticeComposer } from "@/features/notices/components/NoticeComposer";
import { CustomNoticeComposer } from "@/features/notices/components/CustomNoticeComposer";
import { UpdateComposer } from "@/features/sancturmUpdates/components/UpdateComposer";
import { CustomUpdateComposer } from "@/features/sancturmUpdates/components/CustomUpdateComposer";
import { cn } from "@/lib/utils";

type UploadType = "notes" | "lab_manual" | "pyq" | "notice" | "update";
type PublishMode = "upload" | "custom";
type BranchOption = { id: string; name: string };
type TermOption = { id: string; label: string };

export function CRUploadForm({
  branches,
  terms,
  fixedBranchId,
  fixedTermId,
  isAdmin,
}: {
  // Every branch, always fetched now — needed even for a CR when
  // resourceType is "pyq" (any CR can publish a PYQ to any branch;
  // notes_lab stays locked to fixedBranchId).
  branches: BranchOption[];
  // Every term — only actually pickable for admin (fixedTermId is
  // undefined for them); a CR's term never changes, even for PYQ —
  // only the branch unlocks there, since a CR is scoped to their own
  // (branch, term) and PYQ's cross-branch exception stays within it.
  terms: TermOption[];
  fixedBranchId?: string;
  fixedTermId?: string;
  // "Update" is admin-only (Sancturm updates has no CR access at all,
  // see supabase/sancturm_updates_v2.sql) — CRs never see that type.
  isAdmin: boolean;
}) {
  const [resourceType, setResourceType] = useState<UploadType>("notes");
  const [publishMode, setPublishMode] = useState<PublishMode>("upload");
  // PYQ is cross-branch even for a CR, so it needs its own pickable
  // branch, separate from the notes_lab-locked fixedBranchId.
  const [pyqBranchId, setPyqBranchId] = useState(fixedBranchId ?? branches[0]?.id ?? "");
  const [termId, setTermId] = useState(fixedTermId ?? terms[0]?.id ?? "");
  // Admin-only: publish one Notes/Lab resource to every branch (within
  // the picked term) at once instead of repeating the upload per
  // branch. Not offered for PYQ, which is already inherently shared
  // across every branch in one row.
  const [allBranches, setAllBranches] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // yyyy-mm-dd from <input type="date">, or "" to leave it blank —
  // an empty value means the insert omits created_at entirely and the
  // database's own now() default applies, exactly today's behavior.
  const [customDate, setCustomDate] = useState("");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const canBulkPublish = isAdmin && (resourceType === "notes" || resourceType === "lab_manual");
  const isBulkPublish = canBulkPublish && allBranches;
  const showBranchPicker = !isBulkPublish && (resourceType === "pyq" || !fixedBranchId);
  const showTermPicker = !fixedTermId;
  const branchId = resourceType === "pyq" ? pyqBranchId : fixedBranchId ?? pyqBranchId;

  // Even in bulk mode, subjects are fetched for one reference branch —
  // every branch has its own subjects row (different id) for the same
  // subject name, so this list only supplies which NAMES exist to
  // choose from; the id itself is discarded when submitting in bulk.
  const { data: allSubjects } = useSubjects(branchId || null, termId || null);
  // Lab-only subjects (Engineering Graphics, Soft Skill) have no
  // notes/PYQ content by design, so they're excluded whenever the
  // upload isn't itself a lab manual.
  const subjects =
    resourceType === "lab_manual"
      ? allSubjects?.filter((subject) => LAB_SUBJECT_SLUGS.has(subject.slug))
      : allSubjects?.filter((subject) => !LAB_ONLY_SUBJECT_SLUGS.has(subject.slug));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !termId || (!isBulkPublish && !branchId)) return;
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
    const titleInput = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const title = titleInput || titleFromFileName(file.name);
    const subjectValue = (form.elements.namedItem("subject") as HTMLSelectElement).value || "";
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
    // Combined with the CURRENT time-of-day (not midnight) so it sorts
    // sensibly against same-day uploads, and built with the local Date
    // constructor (not new Date("yyyy-mm-dd"), which parses as UTC
    // midnight) so the calendar day landed on matches what the CR
    // actually picked regardless of timezone — the exact bug class the
    // date filter itself was fixed for earlier.
    let customCreatedAt = "";
    if (customDate) {
      const [year, month, day] = customDate.split("-").map(Number);
      const now = new Date();
      customCreatedAt = new Date(
        year,
        month - 1,
        day,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      ).toISOString();
    }

    if (isBulkPublish) {
      const subjectName = subjects?.find((subject) => subject.id === subjectValue)?.name ?? "";

      startTransition(async () => {
        try {
          // Straight to R2 from the browser, bypassing the serverless
          // body-size limit a large PDF would otherwise hit.
          const filePath = `all-branches/notes_lab/${crypto.randomUUID()}-${file.name}`;
          const fileUrl = await uploadFileToR2(filePath, file);

          const formData = new FormData();
          formData.set("termId", termId);
          formData.set("subjectName", subjectName);
          formData.set("section", "notes_lab");
          formData.set("resourceType", resourceType);
          formData.set("title", title);
          formData.set("description", description);
          formData.set("fileUrl", fileUrl);
          if (customCreatedAt) formData.set("customCreatedAt", customCreatedAt);

          await uploadResourceDirectAllBranches(formData);
          setSuccess(true);
          formRef.current?.reset();
          setFile(null);
          setCustomDate("");
        } catch {
          setError("Something went wrong. Try again.");
        }
      });
      return;
    }

    const section = resourceType === "pyq" ? "pyq" : "notes_lab";

    startTransition(async () => {
      try {
        const filePath = `${branchId}/${section}/${crypto.randomUUID()}-${file.name}`;
        const fileUrl = await uploadFileToR2(filePath, file);

        const formData = new FormData();
        formData.set("branchId", branchId);
        formData.set("termId", termId);
        formData.set("subjectId", subjectValue);
        formData.set("section", section);
        formData.set("resourceType", resourceType === "pyq" ? "pdf" : resourceType);
        formData.set("title", title);
        formData.set("description", description);
        formData.set("fileUrl", fileUrl);
        if (customCreatedAt) formData.set("customCreatedAt", customCreatedAt);

        await uploadResourceDirect(formData);
        setSuccess(true);
        formRef.current?.reset();
        setFile(null);
        setCustomDate("");
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  const typeOptions = [
    "notes",
    "lab_manual",
    "pyq",
    "notice",
    ...(isAdmin ? (["update"] as const) : []),
  ] as const;

  const typeToggle = (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-subtle-foreground">Type</label>
      {/* flex-wrap: with 5 options (admin gets Update too) this row
          doesn't fit unbroken on a narrow phone — wrapping to a second
          line beats squeezing every label down to a sliver. */}
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
        {typeOptions.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setResourceType(type)}
            className={cn(
              "min-w-[4.5rem] flex-1 rounded px-3 py-1.5 text-sm transition-colors",
              resourceType === type
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground active:text-foreground"
            )}
          >
            {type === "notes"
              ? "Notes"
              : type === "lab_manual"
                ? "Lab"
                : type === "pyq"
                  ? "PYQ"
                  : type === "notice"
                    ? "Notice"
                    : "Update"}
          </button>
        ))}
      </div>
    </div>
  );

  const howToggle = (mode: PublishMode, labels: [string, string]) => (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-subtle-foreground">How</label>
      <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
        {(["upload", "custom"] as const).map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => setPublishMode(m)}
            className={cn(
              "min-w-[8rem] flex-1 rounded px-3 py-1.5 text-sm transition-colors",
              mode === m ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground active:text-foreground"
            )}
          >
            {labels[i]}
          </button>
        ))}
      </div>
    </div>
  );

  if (resourceType === "notice") {
    return (
      <div className="flex flex-col gap-3">
        {typeToggle}
        {howToggle(publishMode, ["Upload PDF", "Write custom notice"])}

        {publishMode === "upload" ? (
          <NoticeComposer
            branches={branches}
            terms={terms}
            fixedBranchId={fixedBranchId}
            fixedTermId={fixedTermId}
          />
        ) : (
          <CustomNoticeComposer
            branches={branches}
            terms={terms}
            fixedBranchId={fixedBranchId}
            fixedTermId={fixedTermId}
          />
        )}
      </div>
    );
  }

  if (resourceType === "update") {
    return (
      <div className="flex flex-col gap-3">
        {typeToggle}
        {howToggle(publishMode, ["Upload PDF", "Write custom update"])}

        {publishMode === "upload" ? <UpdateComposer /> : <CustomUpdateComposer />}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      {typeToggle}

      {canBulkPublish && (
        <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={allBranches}
            onChange={(event) => setAllBranches(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Publish to all branches at once
        </label>
      )}

      {isBulkPublish && (
        <p className="rounded-md border border-dashed border-border px-3 py-2 font-mono text-xs text-subtle-foreground">
          Will publish to every branch ({branches.map((branch) => branch.name).join(", ")}). Subject
          is matched by name in each branch.
        </p>
      )}

      {showTermPicker && (
        <div className="flex flex-col gap-1">
          <label htmlFor="term" className="font-mono text-xs text-subtle-foreground">
            Year
          </label>
          <Select
            id="term"
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

      {showBranchPicker && (
        <div className="flex flex-col gap-1">
          <label htmlFor="branch" className="font-mono text-xs text-subtle-foreground">
            Branch
            {resourceType === "pyq" && (
              <span className="ml-1.5 normal-case text-subtle-foreground/70">
                (PYQs are shared, but still need one branch on record)
              </span>
            )}
          </label>
          <Select
            id="branch"
            value={branchId}
            onChange={(event) => setPyqBranchId(event.target.value)}
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
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="subject" className="font-mono text-xs text-subtle-foreground">
          Subject
        </label>
        <Select
          key={`${resourceType}-${branchId}-${termId}`}
          id="subject"
          name="subject"
          className="bg-background"
        >
          <option value="">Extra</option>
          {subjects?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </Select>
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
        <label className="font-mono text-xs text-subtle-foreground">
          Date <span className="normal-case text-subtle-foreground/70">(optional — defaults to today)</span>
        </label>
        <DateFilterInput
          value={customDate}
          onChange={setCustomDate}
          placeholder="Today"
          className="bg-background"
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
        disabled={isPending || !file || !termId || (!isBulkPublish && !branchId)}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? "Publishing…" : isBulkPublish ? "Publish to all branches" : "Publish now"}
      </button>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          {isBulkPublish
            ? "Published to every branch — already live, no review needed."
            : "Published — it's already live, no review needed."}
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
