"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useTeamDirectory } from "@/features/team/queries";
import { useBranches, useAllSpecializations } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { Skeleton } from "@/components/shared/Skeleton";
import { ResourceViewerDialog } from "@/features/resources/components/ResourceViewerDialog";
import { shortTermLabel, ordinalSemesterLabel } from "@/lib/termLabel";
import { cn } from "@/lib/utils";
import type { TeamDirectoryEntry } from "@/types/database";

type ResolvedRow = {
  key: string;
  name: string;
  branchName: string;
  specializationName: string | null;
  yearLabel: string;
  semesterLabel: string;
  // Raw sort keys, kept alongside the display labels above — sorting
  // on yearLabel itself ("1st Year"/"2nd Year" as strings) happens to
  // work today but breaks the moment a 10th Year exists ("10th Year" <
  // "2nd Year" alphabetically); year_number is the real ordering.
  yearNumber: number;
  // Null until an admin uploads one (see CrCardUploadForm) — View stays
  // visible either way (every CR gets the option) but is disabled
  // until there's actually something to show.
  cardUrl: string | null;
};

// Year, then Branch, then Specialization — matches how the sidebar
// itself scopes browsing (Year picked first, then Branch, then
// Specialization), so the team roster reads in the same order a
// visitor already thinks in. No-specialization branches (Civil,
// Biotechnology, ...) sort before CSE's own specializations at the
// same Branch/Year, since a missing specialization name is treated as
// "" for comparison purposes — harmless since branchName already
// groups them apart from CSE.
function sortRows(rows: ResolvedRow[]): ResolvedRow[] {
  return [...rows].sort(
    (a, b) =>
      a.yearNumber - b.yearNumber ||
      a.branchName.localeCompare(b.branchName) ||
      (a.specializationName ?? "").localeCompare(b.specializationName ?? "") ||
      a.name.localeCompare(b.name)
  );
}

function resolveRows(
  entries: TeamDirectoryEntry[],
  branches: { id: string; name: string; has_specializations: boolean }[],
  specializations: { id: string; name: string }[],
  terms: { id: string; label: string; semester_number: number; year_number: number }[]
): ResolvedRow[] {
  const resolved = entries.map((entry, i) => {
    const branch = branches.find((b) => b.id === entry.branch_id);
    const specialization =
      branch?.has_specializations && entry.specialization_id
        ? specializations.find((s) => s.id === entry.specialization_id)
        : null;
    const term = terms.find((t) => t.id === entry.current_term_id);
    return {
      key: `${entry.display_name}-${i}`,
      name: entry.display_name,
      branchName: branch?.name ?? "—",
      specializationName: specialization?.name ?? null,
      yearLabel: term ? shortTermLabel(term) : "—",
      semesterLabel: term ? ordinalSemesterLabel(term.semester_number) : "—",
      yearNumber: term?.year_number ?? Number.MAX_SAFE_INTEGER,
      cardUrl: entry.card_file_url,
    };
  });
  return sortRows(resolved);
}

/**
 * CRs, publicly, as Admins who help run Sancturm — below Anurag's
 * (the Controller's) unchanged card in the same page. Reads
 * team_directory() (see its own comment in features/team/queries.ts
 * for why that's the only sanctioned public read of CR data at all)
 * and resolves branch/specialization/term names client-side from the
 * same already-public reference tables every other page in this app
 * already resolves names from — no new data-exposure surface here
 * beyond what team_directory() itself deliberately returns.
 */
export function TeamList() {
  const { data: entries, isLoading, isError } = useTeamDirectory();
  const { data: branches } = useBranches();
  const { data: specializations } = useAllSpecializations();
  const { data: terms } = useTerms();

  const rows = useMemo(() => {
    if (!entries || !branches || !specializations || !terms) return null;
    return resolveRows(entries, branches, specializations, terms);
  }, [entries, branches, specializations, terms]);

  // Only ever holds {name, url} for the card actually being looked at
  // — ResourceViewerDialog (reused as-is, same as Sancturm updates'
  // own PDF viewer) doesn't render an <img> until this is non-null, so
  // no card image is fetched until its own View button is clicked, not
  // when the page/list itself loads.
  const [viewingCard, setViewingCard] = useState<{ name: string; url: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Admins · CRs</h2>

      {(isLoading || !rows) && !isError && (
        <>
          {/* Desktop/tablet — same column count as the real table so
              nothing reflows once rows swap in. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block" aria-hidden="true">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-subtle-foreground">
                  <th className="px-4 py-2.5 font-normal">#</th>
                  <th className="px-4 py-2.5 font-normal">Name</th>
                  <th className="px-4 py-2.5 font-normal">Role</th>
                  <th className="px-4 py-2.5 font-normal">Branch</th>
                  <th className="px-4 py-2.5 font-normal">Specialization</th>
                  <th className="px-4 py-2.5 font-normal">Year</th>
                  <th className="px-4 py-2.5 font-normal">Semester</th>
                  <th className="px-4 py-2.5 font-normal">Card</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0">
                    {Array.from({ length: 8 }).map((__, col) => (
                      <td key={col} className="px-4 py-3">
                        <Skeleton className="h-3.5 w-16" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards matching the real card shape. */}
          <div className="flex flex-col gap-2 sm:hidden" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        </>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">
          Couldn&apos;t load the team list. Try refreshing.
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No CRs added yet.
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          {/* Desktop/tablet — a real table, columns stay aligned across
              every row so scanning down "Year" or "Semester" reads
              cleanly. overflow-x-auto is a safety net, not the primary
              responsive strategy (that's the mobile card list below,
              sm:hidden) — this table's own columns are compact enough
              to never actually need it at sm+. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-subtle-foreground">
                  <th className="px-4 py-2.5 font-normal">#</th>
                  <th className="px-4 py-2.5 font-normal">Name</th>
                  <th className="px-4 py-2.5 font-normal">Role</th>
                  <th className="px-4 py-2.5 font-normal">Branch</th>
                  <th className="px-4 py-2.5 font-normal">Specialization</th>
                  <th className="px-4 py-2.5 font-normal">Year</th>
                  <th className="px-4 py-2.5 font-normal">Semester</th>
                  <th className="px-4 py-2.5 font-normal">Card</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-subtle-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">Admin · CR</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.branchName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.specializationName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.yearLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.semesterLabel}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={!row.cardUrl}
                        onClick={() => row.cardUrl && setViewingCard({ name: row.name, url: row.cardUrl })}
                        title={row.cardUrl ? `View ${row.name}'s CR card` : "No card uploaded yet"}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors",
                          row.cardUrl
                            ? "text-foreground hover:bg-background-secondary active:bg-background-secondary"
                            : "cursor-not-allowed text-disabled-foreground"
                        )}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards, one labeled field per line so
              nothing has to shrink or scroll sideways. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((row, index) => (
              <div key={row.key} className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    <span className="mr-1.5 font-mono text-xs text-subtle-foreground">{index + 1}.</span>
                    {row.name}
                  </p>
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-subtle-foreground">
                    Admin · CR
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-subtle-foreground">Branch</dt>
                  <dd className="text-foreground">{row.branchName}</dd>
                  {row.specializationName && (
                    <>
                      <dt className="text-subtle-foreground">Specialization</dt>
                      <dd className="text-foreground">{row.specializationName}</dd>
                    </>
                  )}
                  <dt className="text-subtle-foreground">Year</dt>
                  <dd className="text-foreground">{row.yearLabel}</dd>
                  <dt className="text-subtle-foreground">Semester</dt>
                  <dd className="text-foreground">{row.semesterLabel}</dd>
                </dl>
                <button
                  type="button"
                  disabled={!row.cardUrl}
                  onClick={() => row.cardUrl && setViewingCard({ name: row.name, url: row.cardUrl })}
                  className={cn(
                    "mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors",
                    row.cardUrl
                      ? "text-foreground hover:bg-background-secondary active:bg-background-secondary"
                      : "cursor-not-allowed text-disabled-foreground"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {row.cardUrl ? "View card" : "No card yet"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <ResourceViewerDialog
        resource={viewingCard ? { title: viewingCard.name, file_url: viewingCard.url } : null}
        open={viewingCard !== null}
        onOpenChange={(open) => {
          if (!open) setViewingCard(null);
        }}
      />
    </div>
  );
}
