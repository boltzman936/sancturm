"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, Pin, Share2 } from "lucide-react";
import { useIncrementResourceCounter, type ResourceWithSubject } from "@/features/resources/queries";
import { toggleResourcePin } from "@/features/resources/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { formatShortDate } from "@/lib/date";
import { cn, downloadFile } from "@/lib/utils";

// Students never log in, so there's no real name to show for them —
// "Student submission" is the honest ceiling there. A CR/admin direct
// upload does have a real name, captured at upload time (see
// uploadResourceDirect in features/resources/actions.ts).
function uploaderLabel(resource: { uploaded_by_device: string | null; uploaded_by_name: string | null }) {
  if (resource.uploaded_by_device) return "Student submission";
  if (resource.uploaded_by_name) return resource.uploaded_by_name;
  return "Posted by CR";
}

// Shared by View/Share/Download below — identical styling, only the
// icon and handler differ.
const ICON_BUTTON_CLASS =
  "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background-secondary active:bg-background-secondary hover:text-foreground active:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:p-2";

export function ResourceCard({
  resource,
  onView,
}: {
  resource: ResourceWithSubject;
  onView: (resource: ResourceWithSubject) => void;
}) {
  const incrementDownload = useIncrementResourceCounter("download_count");
  const incrementView = useIncrementResourceCounter("view_count");
  const [copied, setCopied] = useState(false);
  const { data: role } = useCurrentRole();
  const queryClient = useQueryClient();

  // Same scope as everywhere else: admin pins anything, a CR only
  // within what they can already manage — own (branch, specialization)
  // notes_lab, or any specialization within their own branch's PYQ
  // pool (see supabase/scope_pyq_by_branch.sql: PYQ is cross-
  // specialization but never cross-branch) — mirrors the RLS check the
  // server action relies on.
  const canManage =
    role?.type === "admin" ||
    (role?.type === "cr" &&
      resource.branch_id === role.branchId &&
      (resource.section === "pyq" || resource.specialization_id === role.specializationId));

  async function handleTogglePin() {
    await toggleResourcePin(resource.id, !resource.is_pinned);
    queryClient.invalidateQueries({ queryKey: ["resources"] });
  }

  function handleView() {
    incrementView.mutate(resource.id);
    onView(resource);
  }

  function handleDownload() {
    incrementDownload.mutate(resource.id);
    const withoutQuery = resource.file_url.split("?")[0];
    const ext = withoutQuery.includes(".") ? withoutQuery.slice(withoutQuery.lastIndexOf(".")) : "";
    downloadFile(resource.file_url, `${resource.title}${ext}`);
  }

  async function handleShare() {
    // navigator.share opens the OS share sheet (WhatsApp, any AI app,
    // Mail, etc.) — the right behavior on phones, and supported on
    // desktop Chrome/Edge/Safari too. Falls back to copy-to-clipboard
    // only where the API genuinely isn't available.
    if (navigator.share) {
      try {
        await navigator.share({ title: resource.title, url: resource.file_url });
      } catch (err) {
        // AbortError just means the person closed the share sheet —
        // not a failure, nothing to do.
        if ((err as Error).name !== "AbortError") {
          await navigator.clipboard.writeText(resource.file_url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }
      return;
    }

    await navigator.clipboard.writeText(resource.file_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li
      className={cn(
        // Tighter gap on mobile/tablet — the icon column already eats
        // into a narrow card's width, so the space between it and the
        // title shouldn't compete with the title for room too. Desktop
        // has plenty of width for the original gap.
        "flex items-center justify-between gap-2 rounded-lg border bg-card p-4 lg:gap-4",
        resource.is_pinned ? "border-primary/40" : "border-border"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5">
          {resource.is_pinned && (
            <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-current text-primary" />
          )}
          {/* Mobile/tablet: up to 2 lines, wrapping instead of an
              aggressive 1-line ellipsis — the icon row already claims a
              fixed chunk of a narrow card, so a long title needs the
              vertical room more than it needs to stay on one line.
              Desktop has enough width that this basically never
              triggers, so it reverts to the original 1-line behavior
              rather than changing how it already looks there. */}
          <p className="break-words text-foreground line-clamp-2 lg:line-clamp-1">
            {resource.title}
          </p>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle-foreground">
          <span>{resource.subject?.name ?? "Extra"}</span>
          <span aria-hidden="true">·</span>
          <span>{uploaderLabel(resource)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatShortDate(resource.created_at)}</span>
        </p>
      </div>
      {/* Fixed-width column, never grows — the title above is what
          should absorb any extra space (flex-1 on its own container).
          Slightly tighter padding on mobile/tablet than desktop for
          the same reason as the card's gap above: reclaiming width for
          the title on a narrow screen where every icon-button's
          padding counts. */}
      <div className="flex shrink-0 items-center gap-1">
        {canManage && <PinButton pinned={resource.is_pinned} onToggle={handleTogglePin} />}
        <button onClick={handleView} aria-label="View" className={ICON_BUTTON_CLASS}>
          <Eye className="h-4 w-4" />
        </button>
        <button onClick={handleShare} aria-label="Share" className={ICON_BUTTON_CLASS}>
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
        </button>
        <button onClick={handleDownload} aria-label="Download" className={ICON_BUTTON_CLASS}>
          <Download className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
