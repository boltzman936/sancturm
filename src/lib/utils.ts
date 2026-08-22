import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind classes safely, resolving conflicts (e.g. "p-2 p-4" -> "p-4").
 * Every shadcn/ui component uses this — you'll see `className={cn(...)}` everywhere.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DownloadProgress = {
  loaded: number;
  // null when the server didn't send Content-Length (some R2/CDN
  // responses don't for range-less GETs) — callers should render an
  // indeterminate state rather than a stalled 0% in that case.
  total: number | null;
};

/**
 * Forces an actual file download instead of navigating to the URL.
 * window.open(url)/an <a href> pointed straight at the R2 file just
 * opens/previews it in the browser — that's the platform's own
 * heuristic for PDFs and images, and mobile browsers have no "Save As"
 * fallback the way desktop sometimes does, so nothing ever reached the
 * device. Fetching the bytes and downloading via a blob URL (same-
 * origin to the page, unlike the R2 URL) is what actually triggers a
 * save everywhere.
 *
 * Reads the response body as a stream (not response.blob(), which
 * buffers silently with zero visibility into how far along it is) so
 * `onProgress` can report real loaded/total bytes for a large scanned-
 * notes PDF — see ResourceCard's own Preparing/Downloading/Completed/
 * Failed states, which is what actually consumes this.
 *
 * Throws on failure rather than silently falling back to
 * window.open — a caller that hides a real failure behind "well, it
 * opened in a new tab instead" is exactly the dishonest status this
 * was asked to stop doing; an explicit Retry (re-calling this again)
 * is the caller's own responsibility now.
 */
export async function downloadFile(url: string, filename: string, onProgress?: (progress: DownloadProgress) => void) {
  // A stall timeout, not a flat one — same shape as uploadFile.ts's
  // own (see its comment): a large scanned-notes PDF can legitimately
  // take a while end-to-end, but a connection that opens and then
  // never delivers another byte (stalled mid-stream, neither erroring
  // nor closing) used to hang this forever with no way for the caller
  // to ever see a failure. Resets on every chunk actually received;
  // only fires if genuinely nothing arrives for 30s straight.
  const controller = new AbortController();
  let stallTimer: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), 30_000);
  function resetStallTimer() {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), 30_000);
  }

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch {
    clearTimeout(stallTimer);
    throw new Error("Download timed out.");
  }
  if (!response.ok || !response.body) {
    clearTimeout(stallTimer);
    throw new Error(`Download failed (${response.status}).`);
  }

  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      resetStallTimer();
      chunks.push(value);
      loaded += value.length;
      onProgress?.({ loaded, total: total && Number.isFinite(total) ? total : null });
    }
  } catch {
    throw new Error("Download timed out.");
  } finally {
    clearTimeout(stallTimer);
  }

  const blob = new Blob(chunks as BlobPart[]);
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not revoked synchronously right after click() — some browsers
  // (Firefox especially, Safari intermittently) start the actual save
  // asynchronously relative to that call, so revoking the object URL
  // on the very next line can abort a large in-flight download. A
  // short delay lets the browser's own download actually start reading
  // from the blob before the URL backing it disappears.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
