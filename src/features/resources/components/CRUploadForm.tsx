"use client";

import { useRef, useState, useTransition } from "react";
import { useSubjects } from "@/features/resources/queries";
import { uploadResourceDirect, uploadResourceDirectAllBranches } from "@/features/resources/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { LAB_SUBJECT_SLUGS, LAB_ONLY_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { titleFromFileName } from "@/features/uploads/titleFromFileName";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { NoticeComposer } from "@/features/notices/components/NoticeComposer";
import { CustomNoticeComposer } from "@/features/notices/components/CustomNoticeComposer";
import { UpdateComposer } from "@/features/sancturmUpdates/components/UpdateComposer";
import { CustomUpdateComposer } from "@/features/sancturmUpdates/components/CustomUpdateComposer";
import { localDateKey } from "@/lib/date";
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
  // Paper vs. worked solution — the PYQ equivalent of the Notes/Lab
  // split above, just picked with its own toggle instead of being a
  // separate top-level Type button (that'd make the Type row 6-wide).
  const [pyqKind, setPyqKind] = useState<"pyq" | "pyq_solution">("pyq");
  const [termId, setTermId] = useState(fixedTermId ?? terms[0]?.id ?? "");
  // Admin-only: publish one upload to any combination of branches
  // (within the picked term) at once instead of repeating it per
  // branch — a multi-select rather than a single branch or an
  // all-or-nothing checkbox, so publishing to e.g. just AIML + Core
  // doesn't need two separate uploads. Covers PYQ too now, even though
  // PYQ visibility doesn't depend on branch_id (usePyqResources matches
  // on term alone) — this only controls which branch(es) get "on
  // record" as the source, same purpose the single-branch PYQ picker
  // already served for a CR.
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(
    fixedBranchId ? [fixedBranchId] : branches[0] ? [branches[0].id] : []
  );
  const [file, setFile] = useState<File | null>(null);
  // yyyy-mm-dd from <input type="date">, or "" to leave it blank —
  // an empty value means the insert omits created_at entirely and the
  // database's own now() default applies, exactly today's behavior.
  const [customDate, setCustomDate] = useState("");
  // Fraction 0-1 while a file is actively PUTting to R2, null the rest
  // of the time — null (not 0) is what keeps the progress bar hidden
  // before a submit and after one finishes, instead of flashing at 0%.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Admin publishing Notes/Lab/PYQ always goes through the multi-branch
  // picker/action now — whether that's 1 branch or all 3 is just how
  // many are selected, not a separate mode/checkbox to toggle first.
  const canBulkPublish = isAdmin && (resourceType === "notes" || resourceType === "lab_manual" || resourceType === "pyq");
  const showSingleBranchPicker = !canBulkPublish && (resourceType === "pyq" || !fixedBranchId);
  const showTermPicker = !fixedTermId;
  // Only admin can backdate an upload — a CR's custom date is floored
  // at today, so the earliest they can pick is "now", never the past.
  // Recomputed each render rather than memoized: cheap, and it needs
  // to stay accurate if this form is left open across midnight.
  const minUploadDate = isAdmin ? undefined : localDateKey(new Date().toISOString());
  const branchId = resourceType === "pyq" ? pyqBranchId : fixedBranchId ?? pyqBranchId;
  // Whichever branch the Subject list previews against — every branch
  // has its own subjects row (different id) for the same subject name,
  // so this only supplies which NAMES exist to choose from; the id
  // itself is discarded when submitting to multiple branches by name.
  const subjectReferenceBranchId = canBulkPublish ? selectedBranchIds[0] ?? "" : branchId;

  const { data: allSubjects } = useSubjects(subjectReferenceBranchId || null, termId || null);
  // Lab-only subjects (Engineering Graphics, Soft Skill) have no
  // notes/PYQ content by design, so they're excluded whenever the
  // upload isn't itself a lab manual.
  const subjects =
    resourceType === "lab_manual"
      ? allSubjects?.filter((subject) => LAB_SUBJECT_SLUGS.has(subject.slug))
      : allSubjects?.filter((subject) => !LAB_ONLY_SUBJECT_SLUGS.has(subject.slug));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !termId) return;
    if (canBulkPublish ? selectedBranchIds.length === 0 : !branchId) return;
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

    if (canBulkPublish) {
      const section = resourceType === "pyq" ? "pyq" : "notes_lab";
      const bulkResourceType = resourceType === "pyq" ? pyqKind : resourceType;
      const subjectName = subjects?.find((subject) => subject.id === subjectValue)?.name ?? "";

      startTransition(async () => {
        setUploadProgress(0);
        try {
          // Straight to R2 from the browser, bypassing the serverless
          // body-size limit a large PDF would otherwise hit.
          const filePath = `multi-branch/${section}/${crypto.randomUUID()}-${file.name}`;
          const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress);

          const formData = new FormData();
          formData.set("termId", termId);
          formData.set("branchIds", JSON.stringify(selectedBranchIds));
          formData.set("subjectName", subjectName);
          formData.set("section", section);
          formData.set("resourceType", bulkResourceType);
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
        } finally {
          setUploadProgress(null);
        }
      });
      return;
    }

    const section = resourceType === "pyq" ? "pyq" : "notes_lab";

    startTransition(async () => {
      setUploadProgress(0);
      try {
        const filePath = `${branchId}/${section}/${crypto.randomUUID()}-${file.name}`;
        const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress);

        const formData = new FormData();
        formData.set("branchId", branchId);
        formData.set("termId", termId);
        formData.set("subjectId", subjectValue);
        formData.set("section", section);
        formData.set("resourceType", resourceType === "pyq" ? pyqKind : resourceType);
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
      } finally {
        setUploadProgress(null);
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
            isAdmin={isAdmin}
          />
        ) : (
          <CustomNoticeComposer
            branches={branches}
            terms={terms}
            fixedBranchId={fixedBranchId}
            fixedTermId={fixedTermId}
            isAdmin={isAdmin}
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

      {resourceType === "pyq" && (
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
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground active:text-foreground"
                )}
              >
                {kind === "pyq" ? "Question paper" : "Solution"}
              </button>
            ))}
          </div>
        </div>
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

      {showSingleBranchPicker && (
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

      {/* Admin only — pick any combination of branches in one control
          instead of a single branch or an all-or-nothing checkbox.
          Selecting every branch IS "publish to all branches"; there's
          no separate mode for it. */}
      {canBulkPublish && (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Branch</label>
          <BranchMultiSelect
            branches={branches}
            selectedBranchIds={selectedBranchIds}
            onChange={setSelectedBranchIds}
          />
          {selectedBranchIds.length > 1 && (
            <p className="mt-1 font-mono text-xs text-subtle-foreground">
              Subject is matched by name in each branch.
            </p>
          )}
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
          Date{" "}
          <span className="normal-case text-subtle-foreground/70">
            (optional — defaults to today{!isAdmin && ", no backdating"})
          </span>
        </label>
        <DateFilterInput
          value={customDate}
          onChange={setCustomDate}
          placeholder="Today"
          minDate={minUploadDate}
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

      {uploadProgress !== null && <UploadProgress fraction={uploadProgress} />}

      <button
        type="submit"
        disabled={
          isPending ||
          !file ||
          !termId ||
          (canBulkPublish ? selectedBranchIds.length === 0 : !branchId)
        }
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending
          ? "Publishing…"
          : canBulkPublish && selectedBranchIds.length > 1
            ? `Publish to ${selectedBranchIds.length} branches`
            : "Publish now"}
      </button>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          {canBulkPublish && selectedBranchIds.length > 1
            ? "Published to every selected branch — already live, no review needed."
            : "Published — it's already live, no review needed."}
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
