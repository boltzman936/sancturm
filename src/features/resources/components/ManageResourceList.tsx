"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { DeleteResourceButton } from "@/features/resources/components/DeleteResourceButton";
import { DeleteNoticeButton } from "@/features/notices/components/DeleteNoticeButton";
import { deleteResource } from "@/features/resources/actions";
import { deleteNotice } from "@/features/notices/actions";
import { useSubjects } from "@/features/resources/queries";
import { LAB_SUBJECT_SLUGS } from "@/features/resources/labSubjects";
import { useBranch } from "@/hooks/useBranch";
import { useBranchBySlug } from "@/features/branches/queries";
import { cn } from "@/lib/utils";

const SECTION_LABEL: Record<string, string> = {
  notes_lab: "Notes & lab",
  pyq: "PYQ",
  notice: "Notices",
};

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  notes: "Notes",
  lab_manual: "Lab",
};

function uploaderLabel(resource: { uploaded_by_device: string | null; uploaded_by_name: string | null }) {
  if (resource.uploaded_by_device) return "Student submission";
  if (resource.uploaded_by_name) return resource.uploaded_by_name;
  return "Posted by CR";
}

function typeGroupLabel(resource: ManageableResource) {
  if (resource.section === "notes_lab") {
    return RESOURCE_TYPE_LABEL[resource.resource_type ?? ""] ?? "Notes & lab";
  }
  return SECTION_LABEL[resource.section] ?? resource.section;
}

export type ManageableResource = {
  id: string;
  // "resource" rows delete through deleteResource; "notice" rows through
  // deleteNotice — the two live in different tables with different RLS.
  kind: "resource" | "notice";
  title: string;
  section: string;
  resource_type: string | null;
  uploaded_by_device: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  subject: { name: string } | null;
  branch: { name: string } | null;
};

const ALL = "all";

function bySubject(a: ManageableResource, b: ManageableResource) {
  return (a.subject?.name ?? "").localeCompare(b.subject?.name ?? "");
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function matchesSearch(resource: ManageableResource, query: string) {
  if (!query.trim()) return true;
  const haystack = [
    resource.title,
    resource.subject?.name ?? "",
    resource.branch?.name ?? "",
    uploaderLabel(resource),
    formatTimestamp(resource.created_at),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

const selectClass =
  "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-subtle-foreground">{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ResourceRow({
  resource,
  isAdmin,
  selected,
  onToggleSelect,
}: {
  resource: ManageableResource;
  isAdmin: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  // Admin sees the branch on every row. A CR only ever manages their
  // own branch's notes_lab items (branch is implied, no need to show
  // it) — but PYQs are shared across branches, so which branch a PYQ
  // came from is genuinely useful context even for a CR.
  const showBranch = isAdmin || resource.section === "pyq";
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border bg-card p-4 transition-colors",
        selected ? "border-primary" : "border-border"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(resource.id)}
          aria-label={`Select ${resource.title}`}
          className="h-4 w-4 shrink-0 accent-primary"
        />
        <div className="min-w-0">
          <p className="truncate text-foreground">{resource.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle-foreground">
            {showBranch && (
              <>
                <span>{resource.branch?.name}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{typeGroupLabel(resource)}</span>
            <span aria-hidden="true">·</span>
            <span>{resource.subject?.name ?? "Extra"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatTimestamp(resource.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{uploaderLabel(resource)}</span>
          </p>
        </div>
      </div>
      {resource.kind === "notice" ? (
        <DeleteNoticeButton noticeId={resource.id} />
      ) : (
        <DeleteResourceButton resourceId={resource.id} />
      )}
    </li>
  );
}

export function ManageResourceList({
  resources,
  isAdmin,
  branches,
}: {
  resources: ManageableResource[];
  isAdmin: boolean;
  // Full catalog (every branch, not just ones with a published item
  // right now) — same fixed-list treatment as TYPE_OPTIONS below.
  branches: { name: string }[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, startBulkDelete] = useTransition();

  const branchOptions = useMemo(() => [...branches.map((b) => b.name)].sort(), [branches]);

  // Fixed set, not derived — Notes/Lab/PYQ/Notices are the app's four
  // upload types regardless of whether one currently has zero items.
  const TYPE_OPTIONS = ["Notes", "Lab", "PYQ", "Notices"];

  // Full subject catalog (not just subjects that happen to have a
  // published item) — same source /notes and /cr/upload use. Subject
  // names are identical across every branch (only the row id differs
  // per branch), so the viewer's own sidebar branch is a fine stand-in
  // even when Branch is set to "All branches" above.
  const { branch: branchSlug } = useBranch();
  const { data: currentBranch } = useBranchBySlug(branchSlug);
  const { data: allSubjects } = useSubjects(currentBranch?.id ?? null);

  // Subjects are scoped to whichever type is picked (a "Lab" subject
  // list is only the subjects with a lab component) — resetting
  // typeFilter clears subjectFilter below so a stale selection never
  // lingers. Notices have no subject at all, so nothing to offer.
  const subjectOptions = useMemo(() => {
    if (typeFilter === "Notices") return [];
    const subjects =
      typeFilter === "Lab"
        ? allSubjects?.filter((subject) => LAB_SUBJECT_SLUGS.has(subject.slug))
        : allSubjects;
    return [...(subjects?.map((subject) => subject.name) ?? []).sort(), "Extra"];
  }, [allSubjects, typeFilter]);

  const visible = useMemo(() => {
    return resources
      .filter((r) => !dateFilter || r.created_at.slice(0, 10) === dateFilter)
      .filter((r) => matchesSearch(r, searchQuery))
      .filter((r) => branchFilter === ALL || r.branch?.name === branchFilter)
      .filter((r) => typeFilter === ALL || typeGroupLabel(r) === typeFilter)
      .filter((r) => subjectFilter === ALL || (r.subject?.name ?? "Extra") === subjectFilter);
  }, [resources, dateFilter, searchQuery, branchFilter, typeFilter, subjectFilter]);

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

  // Date sort applies within whichever view is showing — grouped
  // sections are sorted by subject already, so "newest/oldest" only
  // makes sense in flat mode; grouped mode ignores it deliberately.
  const sortedFlat = useMemo(() => {
    if (!flat) return null;
    const sorted = [...flat];
    sorted.sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return dateSort === "newest" ? diff : -diff;
    });
    return sorted;
  }, [flat, dateSort]);

  const isEmpty = visible.length === 0;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      // Two different tables, two different delete actions — route
      // each item to the one matching its kind, same as the per-row
      // buttons do individually.
      await Promise.all(
        items.map((item) => (item.kind === "notice" ? deleteNotice(item.id) : deleteResource(item.id)))
      );
      setSelectedIds(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, subject, branch, date…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-xs text-subtle-foreground">Exact date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className={`${selectClass} [color-scheme:dark]`}
          />
        </div>

        {dateFilter && (
          <button
            onClick={() => setDateFilter("")}
            className="self-end font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground"
          >
            Clear date
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {isAdmin && (
          <FilterSelect
            label="Branch"
            value={branchFilter}
            onChange={setBranchFilter}
            options={[{ value: ALL, label: "All branches" }, ...branchOptions.map((b) => ({ value: b, label: b }))]}
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

        {typeFilter !== "Notices" && (
          <FilterSelect
            label="Subject"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={[{ value: ALL, label: "All subjects" }, ...subjectOptions.map((s) => ({ value: s, label: s }))]}
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
                className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground"
              >
                Clear
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="rounded-md border border-destructive/40 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              >
                {isBulkDeleting ? "Removing…" : `Remove ${selectedIds.size}`}
              </button>
            </div>
          )}
        </div>
      )}

      {!isEmpty && sortedFlat && (
        <ul className="flex flex-col gap-2">
          {sortedFlat.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              isAdmin={isAdmin}
              selected={selectedIds.has(resource.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </ul>
      )}

      {!isEmpty && groups && (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">
                {group.label.toUpperCase()}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((resource) => (
                  <ResourceRow
                    key={resource.id}
                    resource={resource}
                    isAdmin={isAdmin}
                    selected={selectedIds.has(resource.id)}
                    onToggleSelect={toggleSelect}
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
