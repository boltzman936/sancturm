"use client";

import { AlertCircle, Check, Download, Loader2 } from "lucide-react";
import { useDownload } from "@/hooks/useDownload";
import { cn } from "@/lib/utils";

/**
 * One download icon button with real Preparing/Downloading/Completed/
 * Failed states (see useDownload's own comment) — shared by
 * ResourceCard and Notices so both get the same honest status/retry
 * behavior instead of two independent copies of the same state
 * machine drifting apart.
 */
export function DownloadButton({
  url,
  filename,
  onDownloadStart,
  className,
}: {
  url: string;
  filename: string;
  // Fires once, right when a genuinely NEW download starts (not on a
  // no-op click while one's already in flight) — e.g. for incrementing
  // a resource's download_count exactly once per real attempt.
  onDownloadStart?: () => void;
  className?: string;
}) {
  const { status, progress, download } = useDownload();

  function handleClick() {
    if (status === "preparing" || status === "downloading") return;
    onDownloadStart?.();
    download(url, filename);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "preparing" || status === "downloading"}
      aria-label={
        status === "preparing"
          ? "Preparing download"
          : status === "downloading"
            ? `Downloading${progress !== null ? ` — ${Math.round(progress * 100)}%` : ""}`
            : status === "completed"
              ? "Downloaded"
              : status === "failed"
                ? "Download failed — retry"
                : "Download"
      }
      title={
        status === "downloading" && progress !== null
          ? `${Math.round(progress * 100)}%`
          : status === "failed"
            ? "Download failed — click to retry"
            : undefined
      }
      className={cn(className, "disabled:pointer-events-none disabled:opacity-70")}
    >
      {status === "preparing" || status === "downloading" ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : status === "completed" ? (
        <Check className="h-4 w-4 text-primary" />
      ) : status === "failed" ? (
        <AlertCircle className="h-4 w-4 text-destructive" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </button>
  );
}
