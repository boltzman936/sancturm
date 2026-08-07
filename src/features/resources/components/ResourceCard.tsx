"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, Pin, Share2 } from "lucide-react";
import { useIncrementResourceCounter, type ResourceWithSubject } from "@/features/resources/queries";
import { toggleResourcePin } from "@/features/resources/actions";
import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { PinButton } from "@/components/shared/PinButton";
import { cn } from "@/lib/utils";

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Students never log in, so there's no real name to show for them —
// "Student submission" is the honest ceiling there. A CR/admin direct
// upload does have a real name, captured at upload time (see
// uploadResourceDirect in features/resources/actions.ts).
function uploaderLabel(resource: { uploaded_by_device: string | null; uploaded_by_name: string | null }) {
  if (resource.uploaded_by_device) return "Student submission";
  if (resource.uploaded_by_name) return resource.uploaded_by_name;
  return "Posted by CR";
}

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
  // within what they can already manage (own branch notes_lab, any
  // branch pyq) — mirrors the RLS check the server action relies on.
  const canManage =
    role?.type === "admin" ||
    (role?.type === "cr" &&
      (resource.section === "pyq" || resource.branch_id === role.branchId));

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
    window.open(resource.file_url, "_blank", "noopener,noreferrer");
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
        "flex items-center justify-between gap-4 rounded-lg border bg-card p-4",
        resource.is_pinned ? "border-primary/40" : "border-border"
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {resource.is_pinned && <Pin className="h-3.5 w-3.5 shrink-0 fill-current text-primary" />}
          <p className="truncate text-foreground">{resource.title}</p>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-subtle-foreground">
          <span>{resource.subject?.name ?? "Extra"}</span>
          <span aria-hidden="true">·</span>
          <span>{uploaderLabel(resource)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatTimestamp(resource.created_at)}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canManage && <PinButton pinned={resource.is_pinned} onToggle={handleTogglePin} />}
        <button
          onClick={handleView}
          aria-label="View"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={handleShare}
          aria-label="Share"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
        </button>
        <button
          onClick={handleDownload}
          aria-label="Download"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-background-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
