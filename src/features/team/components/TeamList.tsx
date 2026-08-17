"use client";

import { useMemo } from "react";
import { useTeamDirectory } from "@/features/team/queries";
import { useBranches, useAllSpecializations } from "@/features/branches/queries";
import { useTerms } from "@/features/terms/queries";
import { shortTermLabel, ordinalSemesterLabel } from "@/lib/termLabel";
import type { TeamDirectoryEntry } from "@/types/database";

type ResolvedRow = {
  key: string;
  name: string;
  branchName: string;
  specializationName: string | null;
  yearLabel: string;
  semesterLabel: string;
};

function resolveRows(
  entries: TeamDirectoryEntry[],
  branches: { id: string; name: string; has_specializations: boolean }[],
  specializations: { id: string; name: string }[],
  terms: { id: string; label: string; semester_number: number }[]
): ResolvedRow[] {
  return entries.map((entry, i) => {
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
    };
  });
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

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-xs tracking-[0.08em] text-subtle-foreground">Admins · CRs</h2>

      {(isLoading || !rows) && !isError && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Loading…</div>
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
                  <th className="px-4 py-2.5 font-normal">Name</th>
                  <th className="px-4 py-2.5 font-normal">Role</th>
                  <th className="px-4 py-2.5 font-normal">Branch</th>
                  <th className="px-4 py-2.5 font-normal">Specialization</th>
                  <th className="px-4 py-2.5 font-normal">Year</th>
                  <th className="px-4 py-2.5 font-normal">Semester</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">Admin · CR</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.branchName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.specializationName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.yearLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.semesterLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards, one labeled field per line so
              nothing has to shrink or scroll sideways. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rows.map((row) => (
              <div key={row.key} className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{row.name}</p>
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
