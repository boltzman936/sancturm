"use client";

import { useRef, useState, useTransition } from "react";
import { useSubjects, useExistingResourceTitles } from "@/features/resources/queries";
import { pyqSharingBranchNames } from "@/features/resources/pyqSharing";
import { useTerms } from "@/features/terms/queries";
import { useBatches, useBatchTerms } from "@/features/batches/queries";
import { useResetInvalidSelection } from "@/hooks/useResetInvalidSelection";
import { uploadResourceDirect, uploadResourceDirectAllBranches } from "@/features/resources/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { filterSubjectsForResourceType } from "@/features/resources/labSubjects";
import { titleFromFileName, looksLikeMeaninglessName } from "@/features/uploads/titleFromFileName";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Select } from "@/components/shared/Select";
import { BranchMultiSelect } from "@/components/shared/BranchMultiSelect";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { NoticeComposer } from "@/features/notices/components/NoticeComposer";
import { CustomNoticeComposer } from "@/features/notices/components/CustomNoticeComposer";
import { UpdateComposer } from "@/features/sancturmUpdates/components/UpdateComposer";
import { CustomUpdateComposer } from "@/features/sancturmUpdates/components/CustomUpdateComposer";
import { localDateKey, formatShortDate } from "@/lib/date";
import { cn } from "@/lib/utils";

type UploadType = "notes" | "lab_manual" | "pyq" | "notice" | "update";
type PublishMode = "upload" | "custom";
type BranchOption = { id: string; name: string };
type TermOption = { id: string; label: string };

// Applies to both CR and admin — a shared cap rather than a per-role
// one, since there's no scoping reason (unlike backdating) for it to
// differ between them.
const MAX_FILES = 3;

// Sensible default once a Batch is picked/changes — whichever of that
// batch's semesters real calendar dates say is happening right now,
// falling back to the most recently-started one if none is exactly
// current (shouldn't happen given batch_terms is pre-seeded through
// the batch's whole run, but stays safe if it ever is).
function currentBatchTermId(
  batchTerms: { term_id: string; start_date: string; end_date: string }[] | undefined
): string {
  if (!batchTerms || batchTerms.length === 0) return "";
  const todayKey = localDateKey(new Date().toISOString());
  const current = batchTerms.find((bt) => bt.start_date <= todayKey && todayKey <= bt.end_date);
  return (current ?? batchTerms[batchTerms.length - 1]).term_id;
}

export function CRUploadForm({
  branches,
  terms,
  fixedBranchId,
  fixedTermId,
  fixedBatchId,
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
  // A CR's batch never changes either (their cr_profile's own batch) —
  // only admin gets a picker, same fixed-vs-picker split as Branch/Term.
  fixedBatchId?: string;
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
  // Batch is picked FIRST now — Semester (termId below) is scoped to
  // whichever academic periods THIS batch has actually reached (via
  // useBatchTerms), not the other way around. "" until an admin's
  // explicit pick or the newest-batch fallback loads — same
  // no-sync-effect pattern as effectiveBatchId below.
  const [batchId, setBatchId] = useState(fixedBatchId ?? "");
  // Admin's picked Semester, or "" to defer to whichever of this
  // batch's semesters is currently active (see effectiveTermId).
  const [termId, setTermId] = useState(fixedTermId ?? "");
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
  // Up to MAX_FILES — each becomes its own resource row (own title,
  // own R2 object), sharing whatever Subject/Description/Date was set
  // once in the form. Truncated to the first MAX_FILES rather than
  // rejected outright if more get selected (see fileLimitNotice).
  const [files, setFiles] = useState<File[]>([]);
  const [fileLimitNotice, setFileLimitNotice] = useState(false);
  // Title/Subject are controlled (not read off the DOM at submit time
  // like Description still is) specifically so the "already uploaded"
  // check below can react to them live, before publishing.
  const [titleValue, setTitleValue] = useState("");
  const [subjectValue, setSubjectValue] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" to leave it blank —
  // an empty value means the insert omits created_at entirely and the
  // database's own now() default applies, exactly today's behavior.
  const [customDate, setCustomDate] = useState("");
  // Fraction 0-1 while a file is actively PUTting to R2, null the rest
  // of the time — null (not 0) is what keeps the progress bar hidden
  // before a submit and after one finishes, instead of flashing at 0%.
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Which file (of possibly several) that progress bar is currently
  // for — only used to label it "file 2 of 3", not to gate anything.
  const [uploadingFileIndex, setUploadingFileIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  // Captured at the moment of success, independent of `files` (which
  // gets cleared right after) — so the success message can still say
  // "published 3 files" instead of reading `files.length` as 0.
  const [publishedCount, setPublishedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Aborts the in-flight R2 PUT when Cancel is clicked mid-upload — a
  // fresh controller per submission, not one reused across them.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Admin publishing Notes/Lab/PYQ always goes through the multi-branch
  // picker/action now — whether that's 1 branch or all 3 is just how
  // many are selected, not a separate mode/checkbox to toggle first.
  const canBulkPublish = isAdmin && (resourceType === "notes" || resourceType === "lab_manual" || resourceType === "pyq");
  const showSingleBranchPicker = !canBulkPublish && (resourceType === "pyq" || !fixedBranchId);
  const showBatchPicker = !fixedBatchId;
  const showTermPicker = !fixedTermId;
  // Only admin can backdate an upload — a CR's custom date is floored
  // at today, so the earliest they can pick is "now", never the past.
  // Recomputed each render rather than memoized: cheap, and it needs
  // to stay accurate if this form is left open across midnight.
  const minUploadDate = isAdmin ? undefined : localDateKey(new Date().toISOString());
  const branchId = resourceType === "pyq" ? pyqBranchId : fixedBranchId ?? pyqBranchId;

  // Batch drives Semester now, not the other way — every configured
  // batch is always offered (config-table, zero-resource batches
  // included), newest first.
  const { data: allBatches } = useBatches();
  const effectiveBatchId = fixedBatchId ?? (batchId || allBatches?.[0]?.id || "");

  // Every academic period THIS batch has actually reached, in
  // chronological order — a batch new to 1st Year offers just its 2
  // semesters so far; one further along offers all 4 it's passed
  // through, spanning both years. This is what makes Semester options
  // batch-scoped instead of year-scoped.
  const { data: batchTerms } = useBatchTerms(effectiveBatchId || null);
  const effectiveTermId = fixedTermId ?? (termId || currentBatchTermId(batchTerms));
  // Batch changed underneath an explicit Semester pick that's no
  // longer one of ITS periods (e.g. was on 2025-26's Sem 3, switched
  // to 2026-27 which hasn't reached Sem 3 yet) — defer back to
  // whichever semester is current for the new batch instead of
  // silently submitting a stale/invalid pairing.
  const validTermIds = batchTerms ? batchTerms.map((bt) => bt.term_id) : undefined;
  useResetInvalidSelection(termId, validTermIds, "", setTermId);

  // Whichever branch the Subject list previews against — every branch
  // has its own subjects row (different id) for the same subject name,
  // so this only supplies which NAMES exist to choose from; the id
  // itself is discarded when submitting to multiple branches by name.
  const subjectReferenceBranchId = canBulkPublish ? selectedBranchIds[0] ?? "" : branchId;

  const { data: allSubjects } = useSubjects(subjectReferenceBranchId || null, effectiveTermId || null);
  // Lab-only subjects (Engineering Graphics, Soft Skill) have no
  // notes/PYQ content by design, so they're excluded whenever the
  // upload isn't itself a lab manual.
  const subjects = allSubjects ? filterSubjectsForResourceType(allSubjects, resourceType) : undefined;

  const sectionForDuplicateCheck = resourceType === "pyq" ? "pyq" : resourceType === "notice" || resourceType === "update" ? null : "notes_lab";
  // Legacy "pdf" rows (pre-dating the pyq/pyq_solution split) still
  // count as a question paper for this check — same equivalence
  // usePyqResources/Manage already treat pdf as.
  const resourceTypesForDuplicateCheck =
    resourceType === "pyq" ? (pyqKind === "pyq" ? ["pyq", "pdf"] : ["pyq_solution"]) : [resourceType];
  // For a single-branch PYQ upload, the duplicate check needs the
  // WHOLE sharing group (see pyqSharing.ts), not just the one branch
  // being recorded — a same-named PYQ in a different sharing group
  // (AIDS vs. Core/AIML for 1st Year) isn't actually a duplicate.
  const { data: fullTerms } = useTerms();
  // Year is derived from whichever Semester is in effect, never picked
  // independently — "1st Year - Semester 1" isn't a globally unique
  // period on its own, (batch, semester) is; Year is just a read-out.
  const effectiveTerm = fullTerms?.find((t) => t.id === effectiveTermId);
  const currentYearNumber = effectiveTerm?.year_number;
  const currentBranchName = branches.find((b) => b.id === branchId)?.name;
  const pyqGroupBranchIds =
    currentYearNumber !== undefined && currentBranchName
      ? branches
          .filter((b) => pyqSharingBranchNames(currentYearNumber, currentBranchName).includes(b.name))
          .map((b) => b.id)
      : [];
  const branchIdsForDuplicateCheck = canBulkPublish
    ? selectedBranchIds
    : resourceType === "pyq"
      ? pyqGroupBranchIds
      : branchId
        ? [branchId]
        : [];
  const { data: existingTitles } = useExistingResourceTitles(
    sectionForDuplicateCheck,
    resourceTypesForDuplicateCheck,
    branchIdsForDuplicateCheck,
    effectiveTermId || null,
    subjectValue || null,
    effectiveBatchId || null
  );
  // Same title-per-file logic handleSubmit itself will use — computed
  // here too so the warning shown BEFORE publishing matches exactly
  // what would actually get inserted.
  function titleForFile(file: File, index: number, total: number) {
    const trimmed = titleValue.trim();
    const base = trimmed ? trimmed : fallbackTitleForFile(file);
    return total > 1 ? `${base} (${index + 1})` : base;
  }
  // A file's own name is only a good fallback title when it's actually
  // a name someone chose — a screenshot tool's auto-generated hash or
  // a WhatsApp media id (e.g. "ca9e7d8c-314c-4d4c-9655-a5351133f6c4",
  // "HO8nBszXgAA4jrq") is meaningless as a title even though it IS the
  // file's real name. Falls back further to Subject + today's date in
  // that case, since that's still more useful than the raw hash.
  function fallbackTitleForFile(file: File) {
    const fromFileName = titleFromFileName(file.name);
    if (!looksLikeMeaninglessName(fromFileName)) return fromFileName;
    const subjectName = subjects?.find((subject) => subject.id === subjectValue)?.name;
    return subjectName ? `${subjectName} — ${formatShortDate(new Date().toISOString())}` : "Untitled upload";
  }
  const duplicateFileNames = new Set(
    files
      .filter((file, index) =>
        existingTitles?.has(titleForFile(file, index, files.length).trim().toLowerCase())
      )
      .map((file) => file.name)
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0 || !effectiveTermId || !effectiveBatchId) return;
    if (canBulkPublish ? selectedBranchIds.length === 0 : !branchId) return;
    setSuccess(false);
    setError(null);

    const form = event.currentTarget;
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

    const section = resourceType === "pyq" ? "pyq" : "notes_lab";
    const bulkResourceType = resourceType === "pyq" ? pyqKind : resourceType;
    const subjectName = subjects?.find((subject) => subject.id === subjectValue)?.name ?? "";
    const filesToUpload = files;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    startTransition(async () => {
      let uploadedCount = 0;
      try {
        for (let index = 0; index < filesToUpload.length; index++) {
          const file = filesToUpload[index];
          const title = titleForFile(file, index, filesToUpload.length);

          setUploadingFileIndex(index);
          setUploadProgress(0);

          if (canBulkPublish) {
            // Straight to R2 from the browser, bypassing the serverless
            // body-size limit a large PDF would otherwise hit.
            const filePath = `multi-branch/${section}/${crypto.randomUUID()}-${file.name}`;
            const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress, controller.signal);

            const formData = new FormData();
            formData.set("termId", effectiveTermId);
            formData.set("batchId", effectiveBatchId);
            formData.set("branchIds", JSON.stringify(selectedBranchIds));
            formData.set("subjectName", subjectName);
            formData.set("section", section);
            formData.set("resourceType", bulkResourceType);
            formData.set("title", title);
            formData.set("description", description);
            formData.set("fileUrl", fileUrl);
            if (customCreatedAt) formData.set("customCreatedAt", customCreatedAt);

            await uploadResourceDirectAllBranches(formData);
          } else {
            const filePath = `${branchId}/${section}/${crypto.randomUUID()}-${file.name}`;
            const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress, controller.signal);

            const formData = new FormData();
            formData.set("branchId", branchId);
            formData.set("termId", effectiveTermId);
            formData.set("batchId", effectiveBatchId);
            formData.set("subjectId", subjectValue);
            formData.set("section", section);
            formData.set("resourceType", resourceType === "pyq" ? pyqKind : resourceType);
            formData.set("title", title);
            formData.set("description", description);
            formData.set("fileUrl", fileUrl);
            if (customCreatedAt) formData.set("customCreatedAt", customCreatedAt);

            await uploadResourceDirect(formData);
          }
          uploadedCount++;
        }

        setPublishedCount(uploadedCount);
        setSuccess(true);
        formRef.current?.reset();
        setFiles([]);
        setFileLimitNotice(false);
        setTitleValue("");
        setSubjectValue("");
        setCustomDate("");
      } catch (err) {
        const cancelled = err instanceof DOMException && err.name === "AbortError";
        const message = err instanceof Error ? err.message : null;
        setError(
          cancelled
            ? uploadedCount > 0
              ? `Cancelled — ${uploadedCount} of ${filesToUpload.length} file${filesToUpload.length > 1 ? "s" : ""} were already published before you stopped it.`
              : "Cancelled."
            : uploadedCount > 0
              ? `Published ${uploadedCount} of ${filesToUpload.length} file${filesToUpload.length > 1 ? "s" : ""} — the rest failed${message ? `: ${message}` : ""}. Try again for the ones that didn't go through.`
              : (message ?? "Something went wrong. Try again.")
        );
        // Already-published files stay published — dropping them from the
        // picker so a retry only resubmits what actually failed, instead
        // of re-publishing duplicates.
        if (uploadedCount > 0) setFiles(filesToUpload.slice(uploadedCount));
      } finally {
        setUploadProgress(null);
        setUploadingFileIndex(null);
        abortControllerRef.current = null;
      }
    });
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
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
            onClick={() => {
              setResourceType(type);
              setSubjectValue("");
            }}
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
            fixedBatchId={fixedBatchId}
            isAdmin={isAdmin}
          />
        ) : (
          <CustomNoticeComposer
            branches={branches}
            terms={terms}
            fixedBranchId={fixedBranchId}
            fixedTermId={fixedTermId}
            fixedBatchId={fixedBatchId}
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

      {/* Admin only — a CR's batch is fixed to their own cr_profile.
          Batch comes FIRST now: every configured batch is always
          offered (config-table, newest first, zero-resource batches
          included) — it's the academic context Semester options
          resolve against below, not the other way around. */}
      {showBatchPicker && (
        <div className="flex flex-col gap-1">
          <label htmlFor="batch" className="font-mono text-xs text-subtle-foreground">
            Batch
          </label>
          <Select
            id="batch"
            value={effectiveBatchId}
            onChange={(event) => {
              setBatchId(event.target.value);
              // The new batch's semester list may not include whatever
              // was picked before (useResetInvalidSelection handles
              // that), which can change effectiveTermId out from under
              // Subject — clear it here too, not just on an explicit
              // Semester change, so a stale id can't silently persist.
              setSubjectValue("");
            }}
            className="bg-background"
          >
            {allBatches?.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {showTermPicker && (
        <div className="flex flex-col gap-1">
          <label htmlFor="term" className="font-mono text-xs text-subtle-foreground">
            Semester
            {/* Year is derived from whichever Semester is picked, not
                a separate selector — "1st Year - Semester 1" isn't a
                globally unique period on its own, (batch, semester)
                is. Shown here as a read-only label. */}
            {currentYearNumber !== undefined && (
              <span className="ml-1.5 normal-case text-subtle-foreground/70">
                ({effectiveTerm?.label.split(" - ")[0]})
              </span>
            )}
          </label>
          <Select
            id="term"
            value={effectiveTermId}
            onChange={(event) => {
              setTermId(event.target.value);
              setSubjectValue("");
            }}
            className="bg-background"
          >
            {/* Full label ("1st Year - Semester 1"), not just
                "Semester 1" — a batch's semester list spans multiple
                years once it's progressed far enough, so the year
                needs to stay visible per option, not just in the
                derived label above (which only reflects whichever one
                is currently selected). */}
            {batchTerms?.map((bt) => (
              <option key={bt.term_id} value={bt.term_id}>
                {bt.term.label}
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
            onChange={(event) => {
              setPyqBranchId(event.target.value);
              setSubjectValue("");
            }}
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
            onChange={(ids) => {
              setSelectedBranchIds(ids);
              // The Subject list is sourced from selectedBranchIds[0] (see
              // subjectReferenceBranchId) — a stale subject id from a
              // different branch's list could otherwise silently persist,
              // same reason the single-branch picker clears it on change.
              setSubjectValue("");
            }}
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
          Title{" "}
          <span className="normal-case text-subtle-foreground/70">
            (optional — defaults to file name
            {files.length > 1 ? ", used as a shared prefix across all files" : ""})
          </span>
        </label>
        <input
          id="title"
          name="title"
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="subject" className="font-mono text-xs text-subtle-foreground">
          Subject
        </label>
        <Select
          key={`${resourceType}-${branchId}-${effectiveTermId}`}
          id="subject"
          name="subject"
          value={subjectValue}
          onChange={(event) => setSubjectValue(event.target.value)}
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
          File <span className="normal-case text-subtle-foreground/70">(up to {MAX_FILES} at once)</span>
        </label>
        <input
          id="file"
          type="file"
          multiple
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            setFileLimitNotice(selected.length > MAX_FILES);
            setFiles(selected.slice(0, MAX_FILES));
          }}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        {fileLimitNotice && (
          <p className="font-mono text-xs text-destructive">
            Only the first {MAX_FILES} files were kept — reselect if you meant a different set.
          </p>
        )}
        {files.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-1.5 font-mono text-xs text-subtle-foreground"
              >
                <span className="truncate">{file.name}</span>
                {duplicateFileNames.has(file.name) && (
                  <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                    Already uploaded
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {uploadProgress !== null && (
        <UploadProgress
          fraction={uploadProgress}
          label={
            files.length > 1 ? `Uploading file ${(uploadingFileIndex ?? 0) + 1} of ${files.length}` : "Uploading"
          }
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={
            isPending ||
            files.length === 0 ||
            !effectiveTermId ||
            !effectiveBatchId ||
            (canBulkPublish ? selectedBranchIds.length === 0 : !branchId)
          }
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending
            ? "Publishing…"
            : files.length > 1 && canBulkPublish && selectedBranchIds.length > 1
              ? `Publish ${files.length} files to ${selectedBranchIds.length} branches`
              : canBulkPublish && selectedBranchIds.length > 1
                ? `Publish to ${selectedBranchIds.length} branches`
                : files.length > 1
                  ? `Publish ${files.length} files`
                  : "Publish now"}
        </button>
        {isPending && (
          <button
            type="button"
            onClick={handleCancel}
            className="self-start rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary"
          >
            Cancel
          </button>
        )}
      </div>

      {success && (
        <p className="font-mono text-xs text-terminal-blue">
          {canBulkPublish && selectedBranchIds.length > 1
            ? publishedCount > 1
              ? `Published ${publishedCount} files to every selected branch — already live, no review needed.`
              : "Published to every selected branch — already live, no review needed."
            : publishedCount > 1
              ? `Published all ${publishedCount} files — already live, no review needed.`
              : "Published — it's already live, no review needed."}
        </p>
      )}
      {error && <p className="font-mono text-xs text-destructive">{error}</p>}
    </form>
  );
}
