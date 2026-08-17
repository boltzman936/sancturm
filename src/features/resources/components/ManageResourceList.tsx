"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Calendar as CalendarIcon, Pencil, ChevronDown } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DeleteResourceButton } from "@/features/resources/components/DeleteResourceButton";
import { DeleteNoticeButton } from "@/features/notices/components/DeleteNoticeButton";
import { DeleteSancturmUpdateButton } from "@/features/sancturmUpdates/components/DeleteSancturmUpdateButton";
import { deleteResource, updateResourceFields } from "@/features/resources/actions";
import { deleteNotice, updateNoticeFields } from "@/features/notices/actions";
import { deleteSancturmUpdate, updateSancturmUpdateDate } from "@/features/sancturmUpdates/actions";
import { useBranches, useSpecializations } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { useBatches, useBatchesForTerm } from "@/features/batches/queries";
import { useSubjects, useSubjectsForTerms } from "@/features/resources/queries";
import { filterSubjectsForResourceType } from "@/features/resources/labSubjects";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { Calendar } from "@/components/shared/Calendar";
import { Select } from "@/components/shared/Select";
import { useSessionPersistedState } from "@/hooks/useSessionPersistedState";
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
  // null whenever the branch has no specialization concept, or for a
  // "notice"/"update" row's own null case.
  specialization: { name: string } | null;
  term: { label: string } | null;
  batch: { label: string } | null;
  // Raw foreign keys, alongside the name-joined display objects above —
  // EditResourceButton needs the actual ids to pre-select and submit
  // an edit; the display objects alone (name/label text) aren't enough
  // to know which row to point a field at. null for "update" rows,
  // which have none of these (Sancturm Updates isn't scoped to any of
  // branch/term/batch/subject at all).
  branch_id: string | null;
  specialization_id: string | null;
  term_id: string | null;
  batch_id: string | null;
  subject_id: string | null;
  // Content-identity signals groupByContent prefers, in order — both
  // null for "notice"/"update" rows, which have no file at all.
  // content_hash catches the SAME file re-uploaded as a genuinely
  // separate object (the common real case: the identical PDF uploaded
  // once per branch by hand); file_url is the fallback for older rows
  // uploaded before this column existed.
  file_url: string | null;
  content_hash: string | null;
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

// This is a display/inventory grouping only — it never merges the
// underlying academic resource assignments. Every row stays its own
// independent (branch, specialization, term, batch, subject) record
// in the database and in every query that isn't this Manage list (see
// each row's own branch_id/specialization_id/term_id/batch_id below,
// completely untouched by this grouping). All this does is let Manage
// present several rows that are genuinely the SAME uploaded content —
// same physical file — as one card instead of one repeated card per
// academic context.
type ResourceGroup = { items: ManageableResource[] };

// Content identity, not title/date/branch: a "resource" row's file_url
// is the one thing that's actually the SAME across every context that
// content was initialized into (see supabase/
// initialize_2025_26_shared_content.sql and its siblings — the exact
// same file_url gets reused verbatim, never a re-uploaded copy). Title
// alone is explicitly NOT enough — two independently-uploaded files
// that happen to share a title (e.g. two different "Physics Notes"
// PDFs) must stay separate cards, which grouping by file_url already
// guarantees since they'd never share that value. A row missing
// file_url (shouldn't happen for a real "resource" row, but handled
// defensively) falls through to its own id, so it never accidentally
// merges with anything.
//
// "notice"/"update" rows have no file at all, so they keep the
// original same-publish-action grouping instead (branch/term/batch/
// subject/title/date, scoped per branch — see
// createNoticeAllBranches/uploadResourceDirectAllBranches, which fan
// one bulk-publish action out to one row per branch/specialization).
// That's a different, still-legitimate kind of grouping ("one real
// event") and is unrelated to content-identity grouping.
function contentGroupKey(r: ManageableResource): string {
  if (r.kind === "resource") {
    // content_hash first — the actual byte-content signature, so it
    // correctly merges the SAME file uploaded as a genuinely separate
    // R2 object each time (see its own comment on ManageableResource).
    // file_url next, for older rows uploaded before this column
    // existed. A row with neither gets its own id as the key, so it
    // never accidentally merges with anything.
    if (r.content_hash) return `hash:${r.content_hash}`;
    return r.file_url ? `file:${r.file_url}` : `row:${r.id}`;
  }
  return [
    r.kind,
    r.branch_id ?? "",
    r.section,
    r.resource_type ?? "",
    r.term_id ?? "",
    r.batch_id ?? "",
    r.subject?.name ?? "",
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
      resource.specialization?.name,
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
  const [specializationId, setSpecializationId] = useState(resource.specialization_id ?? "");
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
  const currentBranch = branches?.find((b) => b.id === branchId);
  const { data: branchSpecializations } = useSpecializations(currentBranch?.has_specializations ? branchId : null);
  const effectiveSpecializationId = currentBranch?.has_specializations ? specializationId || null : null;
  // Driven by the currently-picked Type, not the resource's original
  // section — switching Type here can move a row between notes_lab
  // and pyq, so "on record" and the valid subject list both need to
  // track whatever's selected right now, not what it started as.
  const isPyqType = resourceType === "pyq" || resourceType === "pyq_solution";
  const { data: allSubjects } = useSubjects(
    resource.kind === "resource" ? branchId || null : null,
    resource.kind === "resource" ? effectiveSpecializationId : null,
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
            specializationId: effectiveSpecializationId,
            termId,
            batchId: effectiveBatchId,
            crOnly,
            dateKey,
          });
        } else {
          await updateResourceFields(resource.id, {
            branchId,
            specializationId: effectiveSpecializationId,
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
              {/* "Year and Semester", matching CRUploadForm's identical
                  field — every option is a full "1st Year - Semester 1"
                  label, so the heading should say what's actually being
                  picked, not just "Year". */}
              <label className="font-mono text-xs text-subtle-foreground">Year and Semester</label>
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
                  setSpecializationId("");
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

            {currentBranch?.has_specializations && (
              <div className="flex flex-col gap-1">
                <label className="font-mono text-xs text-subtle-foreground">Specialization</label>
                <Select
                  value={specializationId}
                  onChange={(event) => {
                    setSpecializationId(event.target.value);
                    setSubjectId("");
                  }}
                  className="bg-background"
                >
                  {branchSpecializations?.map((specialization) => (
                    <option key={specialization.id} value={specialization.id}>
                      {specialization.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

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

// Renders one content group — a single card either way, but a group
// with more than one item (see groupByContent) shows an expandable
// "N contexts" list instead of repeating the whole card once per
// academic context, and its checkbox/top-level Remove act on every row
// in the group together. Edit only ever applies to a single row
// (branch/specialization/term/batch/subject are genuinely per-row
// fields, independently divergent per context now that grouping is by
// content identity rather than by shared academic scope), so it's
// hidden for a grouped card in favor of each expanded row's own Edit;
// ungrouped items (the common case — most content only ever lives in
// one context) render and behave exactly as a single row always has.
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
  const [expanded, setExpanded] = useState(false);

  // A single (ungrouped) item shows its branch/specialization/term/
  // batch inline, same as always. A grouped card's whole point is that
  // those fields DIFFER per context — cramming them into the summary
  // line would either be misleading (picking one arbitrarily) or
  // unreadable (joining every distinct value across 5+ contexts), so
  // the summary instead shows only what's actually shared across every
  // context (term/batch, when uniform) and defers the rest to the
  // expandable context list below, matching the "don't make the card
  // excessively large by default" requirement.
  const showBranch = !isGrouped && (isAdmin || primary.section === "pyq");
  const showSpecialization = !isGrouped && (isAdmin || primary.section === "pyq");
  const termLabels = Array.from(
    new Set(items.map((item) => item.term?.label).filter((label): label is string => !!label))
  );
  const batchLabels = Array.from(
    new Set(items.map((item) => item.batch?.label).filter((label): label is string => !!label))
  );
  const showTerm = isAdmin && termLabels.length > 0;
  const showBatch = isAdmin && batchLabels.length > 0;
  const termSummary = termLabels.length === 1 ? termLabels[0] : "Multiple semesters";
  const batchSummary = batchLabels.length === 1 ? batchLabels[0] : "Multiple batches";
  const allSelected = items.every((item) => selectedIds.has(item.id));

  function contextLabel(item: ManageableResource) {
    const parts = [item.branch?.name, item.specialization?.name].filter((part): part is string => !!part);
    const scope = [item.term?.label, item.batch?.label].filter((part): part is string => !!part).join(" · ");
    return scope ? `${parts.join(" → ")} → ${scope}` : parts.join(" → ");
  }

  function handleGroupDelete() {
    if (
      !confirm(
        `Remove this content from ${items.length} academic contexts? This can't be undone.`
      )
    )
      return;
    startDelete(async () => {
      await Promise.all(items.map(deleteItem));
    });
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors",
        allSelected ? "border-primary" : "border-border"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
                  <span>{termSummary}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {showBatch && (
                <>
                  <span>{batchSummary}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {showBranch && primary.branch?.name && (
                <>
                  <span>{primary.branch.name}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {showSpecialization && primary.specialization?.name && (
                <>
                  <span>{primary.specialization.name}</span>
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
              {isGrouped && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-foreground">
                    {items.length} context{items.length > 1 ? "s" : ""}
                  </span>
                </>
              )}
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
            <>
              {/* Per-context Edit/Remove without collapsing the summary
                  card back into repeated ones — branch/specialization/
                  term/batch/subject can all genuinely diverge per row
                  now that grouping is by content identity, not by
                  academic context, so there's no single Edit that could
                  apply to the whole group at once. */}
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-label={expanded ? "Hide contexts" : "Show contexts"}
                aria-expanded={expanded}
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground"
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleGroupDelete}
                className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {isDeleting ? "Removing…" : `Remove (${items.length})`}
              </button>
            </>
          ) : primary.kind === "notice" ? (
            <DeleteNoticeButton noticeId={primary.id} />
          ) : primary.kind === "update" ? (
            <DeleteSancturmUpdateButton updateId={primary.id} />
          ) : (
            <DeleteResourceButton resourceId={primary.id} />
          )}
        </div>
      </div>

      {isGrouped && expanded && (
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-md bg-background-secondary/60 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <span className="font-mono text-xs text-subtle-foreground">{contextLabel(item)}</span>
              <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                {isAdmin &&
                  (item.kind === "update" ? (
                    <EditDateButton id={item.id} createdAt={item.created_at} />
                  ) : (
                    <EditResourceButton resource={item} />
                  ))}
                {item.kind === "notice" ? (
                  <DeleteNoticeButton noticeId={item.id} />
                ) : item.kind === "update" ? (
                  <DeleteSancturmUpdateButton updateId={item.id} />
                ) : (
                  <DeleteResourceButton resourceId={item.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
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
  // Persisted for the session (see useSessionPersistedState) so an
  // admin's active filter combination survives a route change — e.g.
  // Manage -> a resource's own page -> Manage — instead of silently
  // resetting to "All" the moment this component remounts, same bug
  // class as Notes/PYQs' Semester and Subject filters.
  const [branchFilter, setBranchFilter] = useSessionPersistedState<string>("sancturm:manage:branchFilter", ALL);
  const [specializationFilter, setSpecializationFilter] = useSessionPersistedState<string>(
    "sancturm:manage:specializationFilter",
    ALL
  );
  const [termFilter, setTermFilter] = useSessionPersistedState<string>("sancturm:manage:termFilter", ALL);
  const [batchFilter, setBatchFilter] = useSessionPersistedState<string>("sancturm:manage:batchFilter", ALL);
  const [typeFilter, setTypeFilter] = useSessionPersistedState<string>("sancturm:manage:typeFilter", ALL);
  const [subjectFilter, setSubjectFilter] = useSessionPersistedState<string>("sancturm:manage:subjectFilter", ALL);
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
    setSpecializationFilter(ALL);
    setSubjectFilter(ALL);
  }
  function handleSpecializationFilterChange(value: string) {
    setSpecializationFilter(value);
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
  const selectedBranchForFilter = useMemo(() => {
    if (branchFilter === ALL || !branches) return null;
    return branches.find((b) => b.name === branchFilter) ?? null;
  }, [branchFilter, branches]);
  const branchIdForSubjects = selectedBranchForFilter?.id ?? null;
  // Only CSE has specializations — this filter only renders once a
  // branch with has_specializations is explicitly picked (same gating
  // rule the Cockpit/Upload/Edit cascades already use everywhere else).
  const { data: specializationsForFilter } = useSpecializations(
    selectedBranchForFilter?.has_specializations ? selectedBranchForFilter.id : null
  );
  const specializationOptions = useMemo(
    () => (specializationsForFilter ?? []).map((s) => s.name),
    [specializationsForFilter]
  );

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
  const specializationIdForFilter = useMemo(() => {
    if (specializationFilter === ALL || !specializationsForFilter) return null;
    return specializationsForFilter.find((s) => s.name === specializationFilter)?.id ?? null;
  }, [specializationFilter, specializationsForFilter]);

  const subjectOptions = useMemo(() => {
    if (typeFilter === "Notices" || typeFilter === "Sancturm updates") return [];
    let scoped = branchIdForSubjects
      ? (termSubjects ?? []).filter((s) => s.branch_id === branchIdForSubjects)
      : (termSubjects ?? []);
    // Once a specialization is picked, narrow further — CSE's subjects
    // are per-specialization, so without this a name unique to a
    // sibling specialization (e.g. Core-only) would still show up as
    // a Subject option while browsing AIML, yielding zero results if
    // picked.
    if (specializationIdForFilter) {
      scoped = scoped.filter((s) => s.specialization_id === specializationIdForFilter);
    }
    const mappedType = TYPE_LABEL_TO_RESOURCE_TYPE[typeFilter];
    if (mappedType) scoped = filterSubjectsForResourceType(scoped, mappedType);
    const names = new Set(scoped.map((s) => s.name));
    return [...Array.from(names).sort(), "Extra"];
  }, [termSubjects, branchIdForSubjects, specializationIdForFilter, typeFilter]);

  const visible = useMemo(() => {
    return resources
      .filter((r) => !dateFilter || localDateKey(r.created_at) === dateFilter)
      .filter((r) => matchesSearch(r, searchQuery))
      .filter((r) => branchFilter === ALL || r.branch?.name === branchFilter)
      .filter((r) => specializationFilter === ALL || r.specialization?.name === specializationFilter)
      .filter((r) => termFilter === ALL || shortTermLabel(r.term) === termFilter)
      .filter((r) => batchFilter === ALL || r.batch?.label === batchFilter)
      .filter((r) => matchesTypeFilter(r, typeFilter))
      .filter((r) => subjectFilter === ALL || (r.subject?.name ?? "Extra") === subjectFilter);
  }, [
    resources,
    dateFilter,
    searchQuery,
    branchFilter,
    specializationFilter,
    termFilter,
    batchFilter,
    typeFilter,
    subjectFilter,
  ]);

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

  // Grouped by content identity independent of which of the two render
  // paths above is active (flat vs. type-labeled sections) — see
  // contentGroupKey's own comment. "Select all" and its count operate
  // on these cards, not raw rows: a same-file card spanning 5 academic
  // contexts counts as ONE toward "Select all (N)", matching what's
  // actually rendered, while still selecting/removing every one of its
  // underlying rows when acted on (selectedIds itself stays a raw-row
  // id Set — toggleIds already selects a whole group's ids together,
  // see its own comment — so the actual delete/bulk-delete behavior is
  // unaffected by this, only the displayed count and "select all"
  // semantics are).
  const visibleGroups = useMemo(() => groupByContent(visible), [visible]);

  // Takes an array (not a single id) so a grouped card's checkbox can
  // select/deselect every row it covers as one action — an ungrouped
  // row just calls this with its own single-id array.
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

  const allVisibleSelected =
    visibleGroups.length > 0 && visibleGroups.every((group) => group.items.every((r) => selectedIds.has(r.id)));

  // How many CARDS have every one of their rows selected — shown next
  // to the raw selectedIds.size (the actual delete button's own count,
  // since that's what genuinely gets removed) so a multi-context card
  // being selected/removed is never ambiguous about how many rows that
  // really is.
  const selectedGroupCount = visibleGroups.filter((group) => group.items.every((r) => selectedIds.has(r.id))).length;

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

        {isAdmin && selectedBranchForFilter?.has_specializations && (
          <FilterSelect
            label="Specialization"
            value={specializationFilter}
            onChange={handleSpecializationFilterChange}
            options={[
              { value: ALL, label: "All specializations" },
              ...specializationOptions.map((s) => ({ value: s, label: s })),
            ]}
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

        {isAdmin && selectedBranchForFilter?.has_specializations && (
          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              label="Specialization"
              value={specializationFilter}
              onChange={handleSpecializationFilterChange}
              options={[
                { value: ALL, label: "All specializations" },
                ...specializationOptions.map((s) => ({ value: s, label: s })),
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
            Select all ({visibleGroups.length})
          </label>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-foreground">
                {selectedGroupCount} selected
                {selectedIds.size !== selectedGroupCount ? ` (${selectedIds.size} items)` : ""}
              </span>
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
