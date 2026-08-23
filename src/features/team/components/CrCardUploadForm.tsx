"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, UserRound } from "lucide-react";
import { useCrProfilesForAdmin, type CrProfileForAdmin } from "@/features/team/queries";
import { useBranches, useAllSpecializations } from "@/features/branches/queries";
import { uploadCrCard, removeCrCard } from "@/features/team/actions";
import { uploadFileToR2 } from "@/features/uploads/uploadFile";
import { UploadProgress } from "@/components/shared/UploadProgress";
import { cn } from "@/lib/utils";

/**
 * Admin-only "CR Card" upload type inside CRUploadForm (see its own
 * typeOptions — this slots in exactly like Notice/Update already do).
 * Selection is by cr_profiles.id, sourced from useCrProfilesForAdmin —
 * never a free-text name — so the uploaded card is associated with the
 * exact CR row, not a name string that could collide or drift.
 */
export function CrCardUploadForm() {
  const { data: crProfiles, isLoading } = useCrProfilesForAdmin();
  const { data: branches } = useBranches();
  const { data: specializations } = useAllSpecializations();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CrProfileForAdmin | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const identify = useCallback(
    (cr: CrProfileForAdmin): string => {
      const branch = branches?.find((b) => b.id === cr.branch_id);
      const specialization = cr.specialization_id
        ? specializations?.find((s) => s.id === cr.specialization_id)
        : null;
      const parts = [branch?.name, specialization?.name, `Year ${cr.year_number}`].filter(Boolean);
      return parts.join(" · ");
    },
    [branches, specializations]
  );

  const filtered = useMemo(() => {
    if (!crProfiles) return [];
    const q = query.trim().toLowerCase();
    if (!q) return crProfiles;
    return crProfiles.filter(
      (cr) => cr.display_name.toLowerCase().includes(q) || identify(cr).toLowerCase().includes(q)
    );
    // branches/specializations are genuine deps here (via identify,
    // now stable via useCallback) — they're separate queries from
    // crProfiles and routinely resolve later, so omitting them meant
    // searching by branch/specialization name silently matched nothing
    // until some unrelated re-render happened to recompute this.
  }, [crProfiles, query, identify]);

  function reset() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUpload() {
    if (!selected || !file) return;
    setSuccess(false);
    setError(null);
    startTransition(async () => {
      setUploadProgress(0);
      try {
        const filePath = `cr-cards/${selected.id}-${crypto.randomUUID()}-${file.name}`;
        const fileUrl = await uploadFileToR2(filePath, file, setUploadProgress);
        await uploadCrCard(selected.id, fileUrl);
        queryClient.invalidateQueries({ queryKey: ["team-directory"] });
        queryClient.invalidateQueries({ queryKey: ["cr-profiles-admin"] });
        // Without this, `selected` keeps pointing at the pre-upload
        // snapshot (card_file_url: null) until the admin clicks the
        // same row again — the button below would still read "Upload
        // card" instead of "Replace card" right after a successful
        // upload, even though one now exists.
        setSelected((prev) => (prev ? { ...prev, card_file_url: fileUrl } : prev));
        setSuccess(true);
        reset();
      } catch {
        setError("Something went wrong. Try again.");
      } finally {
        setUploadProgress(null);
      }
    });
  }

  function handleRemove() {
    if (!selected) return;
    setSuccess(false);
    setError(null);
    startTransition(async () => {
      try {
        await removeCrCard(selected.id);
        queryClient.invalidateQueries({ queryKey: ["team-directory"] });
        queryClient.invalidateQueries({ queryKey: ["cr-profiles-admin"] });
        setSelected((prev) => (prev ? { ...prev, card_file_url: null } : prev));
        setSuccess(true);
        reset();
      } catch {
        setError("Something went wrong. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="cr-card-search" className="font-mono text-xs text-subtle-foreground">
          Find CR
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
          <input
            id="cr-card-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder="Search CR by name…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* The list stays visible (not just a dropdown-on-focus) so the
          full roster is scannable even with an empty search — the
          usual pattern for a short (~10 row) list where scrolling a
          fixed box beats hiding everything behind a click. */}
      <div className="max-h-52 overflow-y-auto rounded-md border border-border">
        {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No CR matches &quot;{query}&quot;.</p>
        )}
        {filtered.map((cr) => (
          <button
            key={cr.id}
            type="button"
            onClick={() => {
              setSelected(cr);
              // Otherwise switching CRs mid-flow could show a stale
              // "Saved." from the PREVIOUS CR's upload, or leave a
              // picked file queued against a CR it was never chosen
              // for.
              setSuccess(false);
              setError(null);
              reset();
            }}
            className={cn(
              // Stacked on mobile (name row, then identify+badge row
              // below it, both full-width and free to wrap on their
              // own), single row from sm: up — the previous single-row-
              // always layout had the identify text (branch ·
              // specialization · Year N, sometimes fairly long — e.g.
              // "Automation & Robotics · Year 2") and the "has card"
              // badge both shrink-0 with nothing willing to give up
              // width, so on a narrow phone the row simply overflowed
              // past the card's own border instead of wrapping.
              "flex w-full flex-col gap-1 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 sm:flex-row sm:items-center sm:gap-2.5",
              selected?.id === cr.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground hover:bg-background-secondary active:bg-background-secondary"
            )}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-subtle-foreground" />
              <span className="min-w-0 flex-1 truncate sm:flex-1">{cr.display_name}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 pl-6 sm:shrink-0 sm:flex-nowrap sm:pl-0">
              <span className="shrink-0 font-mono text-xs text-subtle-foreground">{identify(cr)}</span>
              {cr.card_file_url && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                  has card
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-sm text-foreground">
            Uploading for <span className="font-medium">{selected.display_name}</span>
            <span className="ml-1.5 font-mono text-xs text-subtle-foreground">({identify(selected)})</span>
          </p>

          <div className="flex flex-col gap-1">
            <label htmlFor="cr-card-file" className="font-mono text-xs text-subtle-foreground">
              Card image
            </label>
            <input
              ref={fileInputRef}
              id="cr-card-file"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
            />
          </div>

          {uploadProgress !== null && <UploadProgress fraction={uploadProgress} />}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isPending || !file}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isPending
                ? "Uploading…"
                : selected.card_file_url
                  ? "Replace card"
                  : "Upload card"}
            </button>
            {selected.card_file_url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="rounded-md border border-border px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
              >
                Remove card
              </button>
            )}
          </div>

          {success && <p className="font-mono text-xs text-terminal-blue">Saved.</p>}
          {error && <p className="font-mono text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
