import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind classes safely, resolving conflicts (e.g. "p-2 p-4" -> "p-4").
 * Every shadcn/ui component uses this — you'll see `className={cn(...)}` everywhere.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Forces an actual file download instead of navigating to the URL.
 * window.open(url)/an <a href> pointed straight at the R2 file just
 * opens/previews it in the browser — that's the platform's own
 * heuristic for PDFs and images, and mobile browsers have no "Save As"
 * fallback the way desktop sometimes does, so nothing ever reached the
 * device. Fetching the bytes and downloading via a blob URL (same-
 * origin to the page, unlike the R2 URL) is what actually triggers a
 * save everywhere. Falls back to the old open-in-tab behavior only if
 * the fetch itself fails, so a network hiccup doesn't lose the file
 * entirely.
 */
export async function downloadFile(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
