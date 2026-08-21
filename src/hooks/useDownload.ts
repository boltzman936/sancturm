"use client";

import { useState } from "react";
import { downloadFile } from "@/lib/utils";

export type DownloadStatus = "idle" | "preparing" | "downloading" | "completed" | "failed";

/**
 * Shared Preparing → Downloading → Completed/Failed state machine for
 * every download button in the app (ResourceCard, Notices) — see
 * downloadFile's own comment for why it streams with real progress
 * instead of a silent response.blob(). "preparing" covers the request-
 * sent-but-no-bytes-yet window (genuinely meaningful for a large
 * scanned-notes PDF against a slow connection — see the module doc);
 * it flips to "downloading" the moment the first chunk actually
 * arrives. `progress` is a 0-1 fraction, or null while indeterminate
 * (no Content-Length, or before the first chunk).
 *
 * `download` no-ops on a second call while one is already in flight —
 * the caller's own click handler doesn't need its own duplicate-click
 * guard.
 */
export function useDownload() {
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [progress, setProgress] = useState<number | null>(null);

  async function download(url: string, filename: string) {
    if (status === "preparing" || status === "downloading") return;
    setStatus("preparing");
    setProgress(null);
    let receivingBytes = false;
    try {
      await downloadFile(url, filename, ({ loaded, total }) => {
        if (!receivingBytes) {
          receivingBytes = true;
          setStatus("downloading");
        }
        setProgress(total ? loaded / total : null);
      });
      setStatus("completed");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("failed");
    }
  }

  return { status, progress, download };
}
