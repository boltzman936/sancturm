"use client";

import { useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { DeleteResourceButton } from "@/features/resources/components/DeleteResourceButton";
import { DeleteNoticeButton } from "@/features/notices/components/DeleteNoticeButton";
import { DeleteSancturmUpdateButton } from "@/features/sancturmUpdates/components/DeleteSancturmUpdateButton";
import { deleteResource } from "@/features/resources/actions";
import { deleteNotice } from "@/features/notices/actions";
import { deleteSancturmUpdate } from "@/features/sancturmUpdates/actions";
import { DateFilterInput } from "@/components/shared/DateFilterInput";
import { localDateKey } from "@/lib/date";
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
  // "resource" rows delete through deleteResource, "notice" rows
  // through deleteNotice, "update" rows through deleteSancturmUpdate —
  // three different tables, three different RLS scopes.
  kind: "resource" | "notice" | "update";
  title: string;
  section: string;
  resource_type: string | null;
  uploaded_by_device: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  subject: { name: string } | null;
  branch: { name: string } | null;
  term: { label: string } | null;
};

// Terms show as just "1st Year" / "2nd Year" everywhere in the UI —
// see TermSelectCard's identical comment for why.
function termShortLabel(term: { label: string } | null) {
  return term?.label.split(" - ")[0] ?? "";
}

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
    termShortLabel(resource.term),
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(selectClass, fullWidth && "w-full min-w-0", fixedWidth && "w-[190px] shrink-0")}
      >
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
  // came from is genuinely useful context even for a CR. Term is only
  // ever ambiguous for admin (a CR's own term is implied — even a PYQ
  // stays within their own term, never shown to them cross-term).
  const showBranch = isAdmin || resource.section === "pyq";
  const showTerm = isAdmin && resource.term;
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
            {showTerm && (
              <>
                <span>{termShortLabel(resource.term)}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
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
      ) : resource.kind === "update" ? (
        <DeleteSancturmUpdateButton updateId={resource.id} />
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
  terms,
}: {
  resources: ManageableResource[];
  isAdmin: boolean;
  // Full catalog (every branch, not just ones with a published item
  // right now) — same fixed-list treatment as TYPE_OPTIONS below.
  branches: { name: string }[];
  // Same idea, for year — lets admin narrow the list to one year
  // instead of seeing every branch/term combo interleaved.
  terms: { label: string }[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  // yyyy-mm-dd from <input type="date">, or "" for no date filter.
  const [dateFilter, setDateFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [termFilter, setTermFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [subjectFilter, setSubjectFilter] = useState(ALL);
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, startBulkDelete] = useTransition();

  // Not re-sorted here — `branches` already arrives in the app's
  // standard branch order (AIML, Core, AIDS) straight from the query,
  // and alphabetizing here would silently undo that.
  const branchOptions = useMemo(() => branches.map((b) => b.name), [branches]);
  const termOptions = useMemo(() => terms.map((t) => termShortLabel(t)), [terms]);

  // Fixed set, not derived — these are the app's upload types
  // regardless of whether one currently has zero items. Sancturm
  // updates is admin-only (a CR's list can never contain one — see
  // the query in cr/manage/page.tsx), so it's only offered as a
  // filter option for admin.
  const TYPE_OPTIONS = isAdmin
    ? ["Notes", "Lab", "PYQ", "Notices", "Sancturm updates"]
    : ["Notes", "Lab", "PYQ", "Notices"];

  // Derived from the actual published resources currently in scope
  // (matching Branch/Year/Type, same as `visible` below), not a
  // separate subjects-table query scoped to the viewer's own branch —
  // that stand-in broke once AIDS's 1st-Year subject list diverged
  // from AIML/Core's: an admin browsing "All branches" would only
  // ever see AIML/Core's subject names as filter options, with
  // AIDS-only ones (e.g. Soft Skill) never selectable even though
  // real AIDS resources existed under them. Reading subjects straight
  // off `resources` is also naturally correct for what's Lab-capable —
  // a resource's own resource_type already says so, no separate
  // LAB_SUBJECT_SLUGS lookup needed here.
  const subjectOptions = useMemo(() => {
    if (typeFilter === "Notices" || typeFilter === "Sancturm updates") return [];
    const names = new Set<string>();
    for (const r of resources) {
      if (r.section !== "notes_lab" && r.section !== "pyq") continue;
      if (branchFilter !== ALL && r.branch?.name !== branchFilter) continue;
      if (termFilter !== ALL && termShortLabel(r.term) !== termFilter) continue;
      if (typeFilter !== ALL && typeGroupLabel(r) !== typeFilter) continue;
      if (r.subject?.name) names.add(r.subject.name);
    }
    return [...Array.from(names).sort(), "Extra"];
  }, [resources, branchFilter, termFilter, typeFilter]);

  const visible = useMemo(() => {
    return resources
      .filter((r) => !dateFilter || localDateKey(r.created_at) === dateFilter)
      .filter((r) => matchesSearch(r, searchQuery))
      .filter((r) => branchFilter === ALL || r.branch?.name === branchFilter)
      .filter((r) => termFilter === ALL || termShortLabel(r.term) === termFilter)
      .filter((r) => typeFilter === ALL || typeGroupLabel(r) === typeFilter)
      .filter((r) => subjectFilter === ALL || (r.subject?.name ?? "Extra") === subjectFilter);
  }, [resources, dateFilter, searchQuery, branchFilter, termFilter, typeFilter, subjectFilter]);

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
      // Three different tables, three different delete actions —
      // route each item to the one matching its kind, same as the
      // per-row buttons do individually.
      await Promise.all(
        items.map((item) => {
          if (item.kind === "notice") return deleteNotice(item.id);
          if (item.kind === "update") return deleteSancturmUpdate(item.id);
          return deleteResource(item.id);
        })
      );
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
            onChange={setTermFilter}
            options={[{ value: ALL, label: "All years" }, ...termOptions.map((t) => ({ value: t, label: t }))]}
          />
        )}

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
              onChange={setTermFilter}
              options={[{ value: ALL, label: "All years" }, ...termOptions.map((t) => ({ value: t, label: t }))]}
              fullWidth
            />
            <FilterSelect
              label="Branch"
              value={branchFilter}
              onChange={setBranchFilter}
              options={[
                { value: ALL, label: "All branches" },
                ...branchOptions.map((b) => ({ value: b, label: b })),
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
