"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Calendar as CalendarIcon, Pencil } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DeleteResourceButton } from "@/features/resources/components/DeleteResourceButton";
import { DeleteNoticeButton } from "@/features/notices/components/DeleteNoticeButton";
import { DeleteSancturmUpdateButton } from "@/features/sancturmUpdates/components/DeleteSancturmUpdateButton";
import { deleteResource, updateResourceFields } from "@/features/resources/actions";
import { deleteNotice, updateNoticeFields } from "@/features/notices/actions";
import { deleteSancturmUpdate, updateSancturmUpdateDate } from "@/features/sancturmUpdates/actions";
import { useBranches } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { useBatches, useBatchesForTerm } from "@/features/batches/queries";
import { useSubjects, useSubjectsForTerms } from "@/features/resources/queries";
import { filterSubjectsForResourceType } from "@/features/resources/labSubjects";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Calendar } from "@/components/shared/Calendar";
import { Select } from "@/components/shared/Select";
import { localDateKey, formatShortDate } from "@/lib/date";
import { shortTermLabel } from "@/lib/termLabel";
import { matchesQuery } from "@/lib/search";
import { sortResourcesByBatchThenDate } from "@/lib/sortByDate";
import { cn } from "@/lib/utils";

const SECTION_LABEL: Record<string, string> = {
  notes_lab: "Notes & lab",
  pyq: "PYQ",
  notice: "Notices",
  update: "Sancturm updates",
};

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  notes: "Notes",
  lab_manual: "Lab",
  // PYQ's own two-kind split, same idea as notes/lab_manual above —
  // 'pdf' is the pre-split legacy value (see
  // supabase/add_pyq_solution_type.sql), grouped with the question
  // paper since that's what it always meant before the split existed.
  pyq: "PYQ",
  pdf: "PYQ",
  pyq_solution: "PYQ Solution",
};

function uploaderLabel(resource: { uploaded_by_device: string | null; uploaded_by_name: string | null }) {
  if (resource.uploaded_by_device) return "Student submission";
  if (resource.uploaded_by_name) return resource.uploaded_by_name;
  return "Posted by CR";
}

function typeGroupLabel(resource: ManageableResource) {
  if (resource.section === "notes_lab" || resource.section === "pyq") {
    return RESOURCE_TYPE_LABEL[resource.resource_type ?? ""] ?? SECTION_LABEL[resource.section];
  }
  return SECTION_LABEL[resource.section] ?? resource.section;
}

// "PYQ" and "PYQ Solution" are two separate, mutually-exclusive
// options in the same Type dropdown — matching "PYQ" against the whole
// pyq section (question papers AND solutions) would make "Select all"
// under "PYQ" silently include and bulk-delete solutions too, despite
// "PYQ Solution" existing right next to it as its own option. Legacy
// 'pdf' rows (pre-dating the pyq/pyq_solution split) still count as a
// question paper, same equivalence typeGroupLabel already gives them.
function matchesTypeFilter(resource: ManageableResource, typeFilter: string) {
  if (typeFilter === ALL) return true;
  if (typeFilter === "PYQ") return resource.section === "pyq" && resource.resource_type !== "pyq_solution";
  return typeGroupLabel(resource) === typeFilter;
}

export type ManageableResource = {
  id: string;
  // "resource" rows delete through deleteResource, "notice" rows
  // through deleteNotice, "update" rows through deleteSancturmUpdate —
  // three different tables, three different RLS scopes.
  kind: "resource" | "notice" | "update";
  title: string;
  description: string | null;
  section: string;
  resource_type: string | null;
  uploaded_by_device: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  subject: { name: string } | null;
  branch: { name: string } | null;
  term: { label: string } | null;
  batch: { label: string } | null;
  // Raw foreign keys, alongside the name-joined display objects above —
  // EditResourceButton needs the actual ids to pre-select and submit
  // an edit; the display objects alone (name/label text) aren't enough
  // to know which row to point a field at. null for "update" rows,
  // which have none of these (Sancturm Updates isn't scoped to any of
  // branch/term/batch/subject at all).
  branch_id: string | null;
  term_id: string | null;
  batch_id: string | null;
  subject_id: string | null;
  // Only ever true for a "notice" row — resources/updates have no
  // CR-only concept at all. RLS-enforced (see
  // supabase/add_notice_cr_only.sql), so a student browser never even
  // receives a cr_only row in the first place; this is purely display
  // for CR/admin, who DO receive it.
  cr_only: boolean;
};

const ALL = "all";

function bySubject(a: ManageableResource, b: ManageableResource) {
  return (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "");
}

// Same title/subject/term/batch/type published on the same day but to
// DIFFERENT branches is exactly the shape createNoticeAllBranches /
// uploadResourceDirectAllBranches produce — one row per branch from a
// single bulk-publish action. Grouped into one card (see
// groupByContent below) instead of one repeated card per branch.
//
// localDateKey (the calendar day), not the exact timestamp:
// uploadResourceDirectAllBranches inserts one branch at a time in a
// loop rather than a single bulk insert, so sibling rows' created_at
// can differ by the odd millisecond even though they're unmistakably
// the same publish action. createNoticeAllBranches's own single bulk
// insert happens to share an identical timestamp already, so the
// coarser day-level match still groups those correctly too.
type ResourceGroup = { items: ManageableResource[] };

function contentGroupKey(r: ManageableResource): string {
  return [
    r.kind,
    r.section,
    r.resource_type ?? "",
    r.term_id ?? "",
    r.batch_id ?? "",
    r.subject_id ?? "",
    r.title,
    r.description ?? "",
    localDateKey(r.created_at),
  ].join(" ");
}

// Preserves the caller's own ordering (first-seen position) — this
// runs AFTER the existing subject/date sort already picked an order,
// so re-sorting groups here would undo that.
function groupByContent(items: ManageableResource[]): ResourceGroup[] {
  const buckets = new Map<string, ManageableResource[]>();
  const order: string[] = [];
  for (const item of items) {
    const key = contentGroupKey(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else {
      buckets.set(key, [item]);
      order.push(key);
    }
  }
  return order.map((key) => ({ items: buckets.get(key)! }));
}

// Shared by both the per-group "Remove (N)" button and the top bulk-
// delete action, so the three-table kind-routing can't drift between
// the two call sites.
function deleteItem(item: ManageableResource) {
  if (item.kind === "notice") return deleteNotice(item.id);
  if (item.kind === "update") return deleteSancturmUpdate(item.id);
  return deleteResource(item.id);
}

function matchesSearch(resource: ManageableResource, query: string) {
  return matchesQuery(
    [
      resource.title,
      resource.subject?.name,
      resource.branch?.name,
      shortTermLabel(resource.term),
      uploaderLabel(resource),
      formatShortDate(resource.created_at),
    ],
    query
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  fullWidth = false,
  fixedWidth = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  // Desktop sizes selects to their content (a wrapping flex row of
  // mismatched widths reads fine there); mobile/tablet lays them out
  // in a fixed grid instead, where a content-sized select looks
  // misaligned against its neighbor — fullWidth makes it fill the
  // grid cell so every control in a row lines up.
  fullWidth?: boolean;
  // Subject is the one filter whose content-driven width would
  // actually change from term to term (short 2nd-Year subject names
  // vs. AIDS's much longer 1st-Year ones like "Professional
  // Communication") — same box, different years, different width.
  // fixedWidth pins it so the control is byte-identical everywhere
  // regardless of which term's subjects are loaded.
  fixedWidth?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className="font-mono text-xs text-subtle-foreground">{label}</label>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(fullWidth && "w-full min-w-0", fixedWidth && "w-[190px] shrink-0")}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

// Admin-only — lets Anurag retroactively fix a published item's date
// straight from Manage, instead of that only being settable at upload
// time. Sancturm Updates has none of Branch/Year/Batch/Subject to edit
// (it isn't scoped to any of them at all), so it keeps this simpler
// date-only dialog; EditResourceButton below handles the full field
// set for everything else.
//
// A centered Dialog, not an anchored dropdown — two rounds of trying
// to anchor a popover to this specific trigger (first Radix Popover,
// which anchored the calendar to the top-right of the viewport
// regardless of which row was clicked; then a hand-rolled absolute/
// fixed-position panel, which then ran off the left edge on narrow
// screens) both failed in different ways depending on the trigger's
// position and the viewport size. A centered modal sidesteps all of
// that — same fixed/centered/translate approach every OTHER dialog in
// this app already uses correctly (see ResourceViewerDialog), so
// there's no anchor-relative-to-a-button math left to get wrong on any
// screen size. EditResourceButton's bigger form dialog reuses the same
// approach.
function EditDateButton({ id, createdAt }: { id: string; createdAt: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(dateKey: string) {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      try {
        await updateSancturmUpdateDate(id, dateKey);
      } catch (err) {
        // A Server Action rejecting inside startTransition with nothing
        // catching it takes down the ENTIRE page to Next's generic
        // error screen, not just this row — surfacing it inline here
        // instead is what keeps one bad edit from crashing Manage.
        console.error(err);
        setError("Couldn't update the date. Try again.");
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen(true)}
        aria-label="Change date"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <CalendarIcon className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* hideClose: the dialog's own close button sits top-right,
            the exact corner the calendar's own "next month" arrow
            already occupies — Escape/backdrop-click/selecting a date
            all close this already, so the extra control would only
            collide with a button that's already there. */}
        <DialogContent hideClose className="w-auto max-w-none gap-0 p-0">
          <Calendar value={localDateKey(createdAt)} onChange={handleChange} hideClear />
        </DialogContent>
      </Dialog>
      {error && (
        <p className="absolute right-0 top-full z-50 mt-2 w-40 rounded-md border border-destructive/40 bg-card px-2 py-1.5 font-mono text-xs text-destructive shadow-lg">
          {error}
        </p>
      )}
    </div>
  );
}

// The full editor — every field pickable at upload time (Branch, Year,
// Batch, Subject, Date), not just the date, per the "anything
// selectable at upload must be editable later" requirement. Resource
// rows get all five fields; notice rows get Branch/Year/Batch/Date
// (notices have no subject_id at all). Options come from the same
// client-side queries CRUploadForm itself uses (useBranches/useTerms/
// useBatchesForTerm/useSubjects) rather than new server-fetched props,
// so this needs nothing extra threaded down from the page.
function EditResourceButton({ resource }: { resource: ManageableResource }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [branchId, setBranchId] = useState(resource.branch_id ?? "");
  const [termId, setTermId] = useState(resource.term_id ?? "");
  const [batchId, setBatchId] = useState(resource.batch_id ?? "");
  const [subjectId, setSubjectId] = useState(resource.subject_id ?? "");
  const [dateKey, setDateKey] = useState(localDateKey(resource.created_at));
  const [crOnly, setCrOnly] = useState(resource.cr_only);
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? "");
  // Legacy "pdf" rows (pre-dating the pyq/pyq_solution split) get
  // normalized to "pyq" here — same equivalence the rest of the app
  // already treats them as (see usePyqResources/Manage's own PYQ
  // filter) — so the toggle below always has one of its four real
  // options selected, and saving naturally cleans the legacy value up.
  const [resourceType, setResourceType] = useState<"notes" | "lab_manual" | "pyq" | "pyq_solution">(
    resource.resource_type === "pdf"
      ? "pyq"
      : (resource.resource_type as "notes" | "lab_manual" | "pyq" | "pyq_solution" | null) ?? "notes"
  );

  const { data: branches } = useBranches();
  const { data: terms } = useTerms();
  const { data: validBatches } = useBatchesForTerm(termId || null);
  // Driven by the currently-picked Type, not the resource's original
  // section — switching Type here can move a row between notes_lab
  // and pyq, so "on record" and the valid subject list both need to
  // track whatever's selected right now, not what it started as.
  const isPyqType = resourceType === "pyq" || resourceType === "pyq_solution";
  const { data: allSubjects } = useSubjects(
    resource.kind === "resource" ? branchId || null : null,
    resource.kind === "resource" ? termId || null : null
  );
  const subjects = allSubjects ? filterSubjectsForResourceType(allSubjects, resourceType) : undefined;
  // Falls back to the first term-valid batch instead of an effect
  // "syncing" once validBatches loads async — same reasoning as
  // CRUploadForm's identical effectiveBatchId.
  const effectiveBatchId = batchId || validBatches?.[0]?.id || "";

  function handleSave() {
    if (!branchId || !termId || !effectiveBatchId || !dateKey) return;
    if (resource.kind === "resource" && !title.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        if (resource.kind === "notice") {
          await updateNoticeFields(resource.id, {
            branchId,
            termId,
            batchId: effectiveBatchId,
            crOnly,
            dateKey,
          });
        } else {
          await updateResourceFields(resource.id, {
            branchId,
            termId,
            batchId: effectiveBatchId,
            subjectId: subjectId || null,
            dateKey,
            title: title.trim(),
            description: description.trim() || null,
            resourceType,
            section: isPyqType ? "pyq" : "notes_lab",
          });
        }
        setOpen(false);
      } catch (err) {
        console.error(err);
        setError("Couldn't save these changes. Try again.");
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <div className="flex max-h-[85vh] flex-col gap-3 overflow-y-auto p-6">
            <h2 className="pr-6 text-lg font-medium text-foreground">Edit</h2>

            {resource.kind === "resource" && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-subtle-foreground">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {resource.kind === "resource" && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-subtle-foreground">Type</label>
                {/* All four — not just whatever section this row
                    started in. Picking across the Notes/Lab ↔ PYQ
                    line is a genuine recategorization (changes both
                    `section` and `resource_type` on save), same as
                    picking within one side of it. */}
                <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
                  {(["notes", "lab_manual", "pyq", "pyq_solution"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        setResourceType(kind);
                        setSubjectId("");
                      }}
                      className={cn(
                        "min-w-[7rem] flex-1 rounded px-3 py-1.5 text-sm transition-colors",
                        resourceType === kind
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground active:text-foreground"
                      )}
                    >
                      {kind === "notes"
                        ? "Notes"
                        : kind === "lab_manual"
                          ? "Lab manual"
                          : kind === "pyq"
                            ? "Question paper"
                            : "Solution"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-subtle-foreground">Year</label>
              <Select
                value={termId}
                onChange={(event) => {
                  setTermId(event.target.value);
                  setBatchId("");
                  setSubjectId("");
                }}
                className="bg-background"
              >
                {terms?.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-subtle-foreground">Batch</label>
              <Select
                value={effectiveBatchId}
                onChange={(event) => setBatchId(event.target.value)}
                className="bg-background"
              >
                {validBatches?.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-subtle-foreground">
                Branch{isPyqType && <span className="ml-1.5 normal-case text-subtle-foreground/70">(on record)</span>}
              </label>
              <Select
                value={branchId}
                onChange={(event) => {
                  setBranchId(event.target.value);
                  setSubjectId("");
                }}
                className="bg-background"
              >
                {branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>

            {resource.kind === "notice" && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={crOnly}
                  onChange={(event) => setCrOnly(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Notice for CR only
              </label>
            )}

            {resource.kind === "resource" && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-subtle-foreground">Subject</label>
                <Select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
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
            )}

            {resource.kind === "resource" && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-subtle-foreground">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-subtle-foreground">Date</label>
              <DateFilterInput value={dateKey} onChange={setDateKey} placeholder="Pick a date" className="bg-background" />
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={
                isPending ||
                !branchId ||
                !termId ||
                !effectiveBatchId ||
                !dateKey ||
                (resource.kind === "resource" && !title.trim())
              }
              className="mt-1 self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save changes"}
            </button>
            {error && <p className="font-mono text-xs text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Renders one content group — a single card either way, but a
// multi-branch group (see groupByContent) shows every branch it was
// published to on one line instead of repeating the whole card once
// per branch, and its checkbox/Remove act on every row in the group
// together. Edit only ever applies to a single row (branch/term/batch/
// subject are genuinely per-row fields, sometimes divergent across
// branches under subject interchange — see subjectInterchange.ts), so
// it's hidden for a multi-branch group; ungrouped items (the common
// case) render and behave exactly as a single row always has.
function ResourceGroupRow({
  group,
  isAdmin,
  selectedIds,
  onToggleGroup,
}: {
  group: ResourceGroup;
  isAdmin: boolean;
  selectedIds: Set<string>;
  onToggleGroup: (ids: string[]) => void;
}) {
  const { items } = group;
  const primary = items[0];
  const isGrouped = items.length > 1;
  const [isDeleting, startDelete] = useTransition();

  // Admin sees the branch on every row. A CR only ever manages their
  // own branch's notes_lab items (branch is implied, no need to show
  // it) — but PYQs are shared across branches, so which branch a PYQ
  // came from is genuinely useful context even for a CR. Term is only
  // ever ambiguous for admin (a CR's own term is implied — even a PYQ
  // stays within their own term, never shown to them cross-term).
  const showBranch = isAdmin || primary.section === "pyq";
  const showTerm = isAdmin && primary.term;
  const showBatch = isAdmin && primary.batch;
  const allSelected = items.every((item) => selectedIds.has(item.id));
  // Deduped and joined, not just mapped — a bulk publish always fans
  // out to distinct branches, but this stays correct even if two rows
  // in the same group somehow shared a branch.
  const branchNames = Array.from(
    new Set(items.map((item) => item.branch?.name).filter((name): name is string => !!name))
  );

  function handleGroupDelete() {
    if (!confirm(`Remove this from ${items.length} branches? This can't be undone.`)) return;
    startDelete(async () => {
      await Promise.all(items.map(deleteItem));
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        allSelected ? "border-primary" : "border-border"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => onToggleGroup(items.map((item) => item.id))}
          aria-label={`Select ${primary.title}`}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="break-words text-foreground">{primary.title}</span>
            {primary.cr_only && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                CR only
              </span>
            )}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle-foreground">
            {showTerm && (
              <>
                <span>{shortTermLabel(primary.term)}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {showBatch && (
              <>
                <span>{primary.batch?.label}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            {showBranch && branchNames.length > 0 && (
              <>
                <span>{branchNames.join(", ")}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{typeGroupLabel(primary)}</span>
            <span aria-hidden="true">·</span>
            <span>{primary.subject?.name ?? "Extra"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatShortDate(primary.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{uploaderLabel(primary)}</span>
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        {!isGrouped &&
          isAdmin &&
          (primary.kind === "update" ? (
            <EditDateButton id={primary.id} createdAt={primary.created_at} />
          ) : (
            <EditResourceButton resource={primary} />
          ))}
        {isGrouped ? (
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleGroupDelete}
            className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
          >
            {isDeleting ? "Removing…" : `Remove (${items.length})`}
          </button>
        ) : primary.kind === "notice" ? (
          <DeleteNoticeButton noticeId={primary.id} />
        ) : primary.kind === "update" ? (
          <DeleteSancturmUpdateButton updateId={primary.id} />
        ) : (
          <DeleteResourceButton resourceId={primary.id} />
        )}
      </div>
    </li>
  );
}

// Maps the Type filter's display label to the resourceType
// filterSubjectsForResourceType expects — only for the labels that
// actually map to one concrete resource_type. "All types" doesn't map
// to anything (subjectOptions shows the union, unfiltered by lab-slug,
// same as before); "Notices"/"Sancturm updates" never reach this table
// at all (subjectOptions returns [] for those, checked first).
const TYPE_LABEL_TO_RESOURCE_TYPE: Record<string, "notes" | "lab_manual" | "pyq" | "pyq_solution"> = {
  Notes: "notes",
  Lab: "lab_manual",
  PYQ: "pyq",
  "PYQ Solution": "pyq_solution",
};

export function ManageResourceList({
  resources,
  isAdmin,
}: {
  resources: ManageableResource[];
  isAdmin: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [termFilter, setTermFilter] = useState(ALL);
  const [batchFilter, setBatchFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, startBulkDelete] = useTransition();

  // Branch/Year/Batch all feed subjectOptions above (directly, or via
  // termIdsForSubjects) — same reset-on-change already applied to the
  // Type filter, extended here so a Subject picked under one Branch/
  // Year/Batch doesn't silently keep filtering (to zero results) once
  // switched to a combination it's no longer valid for.
  function handleTermFilterChange(value: string) {
    setTermFilter(value);
    setSubjectFilter(ALL);
  }
  function handleBranchFilterChange(value: string) {
    setBranchFilter(value);
    setSubjectFilter(ALL);
  }
  function handleBatchFilterChange(value: string) {
    setBatchFilter(value);
    setSubjectFilter(ALL);
  }

  // Config-table catalogs, same client hooks EditResourceButton (below,
  // same file) already used — a single source of truth instead of a
  // second, separate server-side fetch that could drift from it.
  const { data: branches } = useBranches();
  const { data: terms } = useTerms();
  const { data: batches } = useBatches();

  // Not re-sorted here — `branches` already arrives in the app's
  // standard branch order (AIML, Core, AIDS) straight from the query,
  // and alphabetizing here would silently undo that.
  const branchOptions = useMemo(() => (branches ?? []).map((b) => b.name), [branches]);
  // Dedupe — Batch/Semester means `terms` can now hold more than one row
  // per year (e.g. "1st Year - Semester 1" and "1st Year - Semester 2"),
  // but this filter matches at the coarser shortTermLabel() ("1st Year")
  // granularity, so without this it showed the same option twice.
  const termOptions = useMemo(() => Array.from(new Set((terms ?? []).map((t) => shortTermLabel(t)))), [terms]);
  const batchOptions = useMemo(() => (batches ?? []).map((b) => b.label), [batches]);

  // Fixed set, not derived — these are the app's upload types
  // regardless of whether one currently has zero items. Sancturm
  // updates is admin-only (a CR's list can never contain one — see
  // the query in cr/manage/page.tsx), so it's only offered as a
  // filter option for admin.
  const TYPE_OPTIONS = isAdmin
    ? ["Notes", "Lab", "PYQ", "PYQ Solution", "Notices", "Sancturm updates"]
    : ["Notes", "Lab", "PYQ", "PYQ Solution", "Notices"];

  // Which exact term id(s) the Year filter's short label resolves to —
  // 1-N (a year can span more than one semester), or every term when
  // "All years" is picked.
  const termIdsForSubjects = useMemo(() => {
    if (!terms) return [];
    if (termFilter === ALL) return terms.map((t) => t.id);
    return terms.filter((t) => shortTermLabel(t) === termFilter).map((t) => t.id);
  }, [terms, termFilter]);
  const { data: termSubjects } = useSubjectsForTerms(termIdsForSubjects);
  const branchIdForSubjects = useMemo(() => {
    if (branchFilter === ALL || !branches) return null;
    return branches.find((b) => b.name === branchFilter)?.id ?? null;
  }, [branchFilter, branches]);

  // Config-table driven (the `subjects` table), not derived from
  // already-published resources — a subject with zero approved
  // uploads still shows up here, same as Notes' Subject filter.
  // Previously this scanned `resources` instead, which was a
  // deliberate workaround for a per-branch subjects query that broke
  // under "All branches" once AIDS's subject list diverged from
  // AIML/Core's — useSubjectsForTerms (all branches, all picked terms,
  // resolved without ever assuming a single branch) doesn't have that
  // problem, since PYQs' page already proves the "all branches" case
  // works via the same underlying query shape.
  const subjectOptions = useMemo(() => {
    if (typeFilter === "Notices" || typeFilter === "Sancturm updates") return [];
    let scoped = branchIdForSubjects
      ? (termSubjects ?? []).filter((s) => s.branch_id === branchIdForSubjects)
      : (termSubjects ?? []);
    const mappedType = TYPE_LABEL_TO_RESOURCE_TYPE[typeFilter];
    if (mappedType) scoped = filterSubjectsForResourceType(scoped, mappedType);
    const names = new Set(scoped.map((s) => s.name));
    return [...Array.from(names).sort(), "Extra"];
  }, [termSubjects, branchIdForSubjects, typeFilter]);

  const visible = useMemo(() => {
    return resources
      .filter((r) => !dateFilter || localDateKey(r.created_at) === dateFilter)
      .filter((r) => matchesSearch(r, searchQuery))
      .filter((r) => branchFilter === ALL || r.branch?.name === branchFilter)
      .filter((r) => termFilter === ALL || shortTermLabel(r.term) === termFilter)
      .filter((r) => batchFilter === ALL || r.batch?.label === batchFilter)
      .filter((r) => matchesTypeFilter(r, typeFilter))
      .filter((r) => subjectFilter === ALL || (r.subject?.name ?? "Extra") === subjectFilter);
  }, [resources, dateFilter, searchQuery, branchFilter, termFilter, batchFilter, typeFilter, subjectFilter]);

  // With no type picked, group into labeled sections (Notes, Lab, PYQ,
  // Notices) so they don't interleave. Once a specific type is chosen
  // the list is already narrowed to it, so a single flat list reads
  // better than a section header repeating the same label.
  const groups = useMemo(() => {
    if (typeFilter !== ALL) return null;
    const byLabel = new Map<string, ManageableResource[]>();
    for (const resource of visible) {
      const label = typeGroupLabel(resource);
      const bucket = byLabel.get(label) ?? [];
      bucket.push(resource);
      byLabel.set(label, bucket);
    }
    return [...byLabel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items: [...items].sort(bySubject) }));
  }, [visible, typeFilter]);

  const flat = useMemo(() => {
    if (typeFilter === ALL) return null;
    return [...visible].sort(bySubject);
  }, [visible, typeFilter]);

  // Newest academic batch always groups first (never reversed by
  // dateSort), same rule as Notes/PYQs — built from the same `batches`
  // catalog already fetched above for the Batch filter, not a new fetch.
  const batchStartYear = useMemo(() => new Map((batches ?? []).map((b) => [b.id, b.start_year])), [batches]);

  // Date sort applies within whichever view is showing — grouped
  // sections are sorted by subject already, so "newest/oldest" only
  // makes sense in flat mode; grouped mode ignores it deliberately.
  const sortedFlat = useMemo(() => {
    if (!flat) return null;
    return sortResourcesByBatchThenDate(flat, dateSort, batchStartYear);
  }, [flat, dateSort, batchStartYear]);

  const isEmpty = visible.length === 0;

  // Takes an array (not a single id) so a multi-branch group's
  // checkbox can select/deselect every row it covers as one action —
  // an ungrouped row just calls this with its own single-id array.
  function toggleIds(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visible) next.delete(r.id);
      } else {
        for (const r of visible) next.add(r.id);
      }
      return next;
    });
  }

  function handleBulkDelete() {
    const items = resources.filter((r) => selectedIds.has(r.id));
    if (items.length === 0) return;
    if (!confirm(`Remove ${items.length} item${items.length > 1 ? "s" : ""}? This can't be undone.`)) return;

    startBulkDelete(async () => {
      await Promise.all(items.map(deleteItem));
      setSelectedIds(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Desktop (lg+) — exact original layout, untouched. Duplicated
          rather than reflowed with responsive classes so the mobile/
          tablet redesign below can't accidentally affect it. */}
      <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, subject, branch, year, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Exact date</label>
          <DateFilterInput value={dateFilter} onChange={setDateFilter} className="min-w-[160px]" />
        </div>

        {dateFilter && (
          <button
            onClick={() => setDateFilter("")}
            className="self-end font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
          >
            Clear date
          </button>
        )}
      </div>

      <div className="hidden lg:flex lg:flex-wrap lg:items-end lg:gap-3">
        {isAdmin && (
          <FilterSelect
            label="Year"
            value={termFilter}
            onChange={handleTermFilterChange}
            options={[{ value: ALL, label: "All years" }, ...termOptions.map((t) => ({ value: t, label: t }))]}
          />
        )}

        {isAdmin && (
          <FilterSelect
            label="Branch"
            value={branchFilter}
            onChange={handleBranchFilterChange}
            options={[{ value: ALL, label: "All branches" }, ...branchOptions.map((b) => ({ value: b, label: b }))]}
          />
        )}

        {isAdmin && (
          <FilterSelect
            label="Batch"
            value={batchFilter}
            onChange={handleBatchFilterChange}
            options={[{ value: ALL, label: "All batches" }, ...batchOptions.map((b) => ({ value: b, label: b }))]}
          />
        )}

        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={(value) => {
            setTypeFilter(value);
            setSubjectFilter(ALL);
          }}
          options={[{ value: ALL, label: "All types" }, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t }))]}
        />

        {typeFilter !== "Notices" && typeFilter !== "Sancturm updates" && (
          <FilterSelect
            label="Subject"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={[{ value: ALL, label: "All subjects" }, ...subjectOptions.map((s) => ({ value: s, label: s }))]}
            fixedWidth
          />
        )}

        <FilterSelect
          label="Date"
          value={dateSort}
          onChange={(value) => setDateSort(value as "newest" | "oldest")}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
        />
      </div>

      {/* Mobile/tablet (below lg) — grouped into one visually distinct
          card, filters laid out in a fixed 2-column grid (fullWidth
          selects) so every control lines up regardless of how long
          its selected option's text is. */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 lg:hidden">
        <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Filters</h2>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, subject, branch, year, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              label="Year"
              value={termFilter}
              onChange={handleTermFilterChange}
              options={[{ value: ALL, label: "All years" }, ...termOptions.map((t) => ({ value: t, label: t }))]}
              fullWidth
            />
            <FilterSelect
              label="Branch"
              value={branchFilter}
              onChange={handleBranchFilterChange}
              options={[
                { value: ALL, label: "All branches" },
                ...branchOptions.map((b) => ({ value: b, label: b })),
              ]}
              fullWidth
            />
          </div>
        )}

        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              label="Batch"
              value={batchFilter}
              onChange={handleBatchFilterChange}
              options={[
                { value: ALL, label: "All batches" },
                ...batchOptions.map((b) => ({ value: b, label: b })),
              ]}
              fullWidth
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <FilterSelect
            label="Type"
            value={typeFilter}
            onChange={(value) => {
              setTypeFilter(value);
              setSubjectFilter(ALL);
            }}
            options={[{ value: ALL, label: "All types" }, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t }))]}
            fullWidth
          />
          {typeFilter !== "Notices" && typeFilter !== "Sancturm updates" && (
            <FilterSelect
              label="Subject"
              value={subjectFilter}
              onChange={setSubjectFilter}
              options={[
                { value: ALL, label: "All subjects" },
                ...subjectOptions.map((s) => ({ value: s, label: s })),
              ]}
              fullWidth
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="font-mono text-xs text-subtle-foreground">Exact date</label>
            <DateFilterInput value={dateFilter} onChange={setDateFilter} className="w-full" />
          </div>
          <FilterSelect
            label="Date"
            value={dateSort}
            onChange={(value) => setDateSort(value as "newest" | "oldest")}
            options={[
              { value: "newest", label: "Newest first" },
              { value: "oldest", label: "Oldest first" },
            ]}
            fullWidth
          />
        </div>

        {dateFilter && (
          <button
            onClick={() => setDateFilter("")}
            className="self-start font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
          >
            Clear date
          </button>
        )}
      </div>

      {isEmpty && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {resources.length === 0 ? "Nothing published yet." : "No matches."}
        </div>
      )}

      {!isEmpty && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 font-mono text-xs text-subtle-foreground">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              className="h-4 w-4 accent-primary"
            />
            Select all ({visible.length})
          </label>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {isBulkDeleting ? "Removing…" : `Remove ${selectedIds.size}`}
              </button>
            </div>
          )}
        </div>
      )}

      {!isEmpty && sortedFlat && (
        <ul className="flex flex-col gap-2">
          {groupByContent(sortedFlat).map((group) => (
            <ResourceGroupRow
              key={group.items[0].id}
              group={group}
              isAdmin={isAdmin}
              selectedIds={selectedIds}
              onToggleGroup={toggleIds}
            />
          ))}
        </ul>
      )}

      {!isEmpty && groups && (
        <div className="flex flex-col gap-5">
          {groups.map((typeGroup) => (
            <div key={typeGroup.label} className="flex flex-col gap-2">
              <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">
                {typeGroup.label.toUpperCase()}
              </h2>
              <ul className="flex flex-col gap-2">
                {groupByContent(typeGroup.items).map((group) => (
                  <ResourceGroupRow
                    key={group.items[0].id}
                    group={group}
                    isAdmin={isAdmin}
                    selectedIds={selectedIds}
                    onToggleGroup={toggleIds}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
