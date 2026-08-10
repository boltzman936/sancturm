"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

// Structural, not tied to the `resources` table — Notices and
// Sancturm Updates reuse this same dialog for their own PDFs, and
// neither has (or needs) the rest of a full ResourceWithSubject row.
type Viewable = { title: string; file_url: string };

function isImageUrl(url: string) {
  const withoutQuery = url.split("?")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

// Caps device-pixel-ratio scaling at 2x — a genuine retina sharpness
// win, but rendering a 3x/4x canvas for a scanned, already-huge PDF on
// a phone is real memory for a difference nobody can see.
const MAX_RENDER_DPR = 2;

/**
 * Fetches the PDF and renders every page onto its own <canvas>, page
 * by page, top to bottom in a normal scrolling column — not a native
 * <iframe>/<embed>/<object> pointed at the file.
 *
 * That native-viewer approach is what this replaces, and the reason
 * is cross-browser inconsistency, not a styling problem: each
 * browser's embedded PDF viewer is a different, closed piece of
 * platform code (PDFium in Chrome, a different engine in Safari,
 * Firefox's own pdf.js fork) with its own sandboxed-iframe quirks,
 * content-blocking behavior, and download-vs-render heuristics — no
 * amount of iframe/CSP tuning makes all of them behave the same way,
 * which is exactly the failure mode reported (works nowhere
 * consistently; sometimes downloads instead of previewing; sometimes
 * a hard "blocked" page). Rendering the actual PDF bytes to canvas
 * ourselves, with one library, removes every one of those engines
 * from the equation — this component's output looks and behaves
 * identically everywhere.
 */
function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // destroy() lives on the loading task, not the resolved
    // PDFDocumentProxy — it tears down the underlying worker/transport
    // regardless of whether the load ever actually resolved, which is
    // exactly what's needed if the dialog closes mid-fetch.
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let currentRenderTask: RenderTask | null = null;
    // Captured once, not re-read as containerRef.current inside the
    // cleanup below — by the time cleanup runs the ref may already
    // point elsewhere (or nowhere), but this element is still the one
    // whose children this effect actually appended.
    const container = containerRef.current;
    if (!container) return;

    async function run() {
      console.log("[pdfdebug] importing pdfjs-dist");
      const pdfjsLib = await import("pdfjs-dist");
      console.log("[pdfdebug] imported, version", pdfjsLib.version);
      // Served from public/ (copied from node_modules by the
      // postinstall script — see package.json) specifically so this
      // is same-origin: the CSP's script-src is 'self', and a worker
      // script falls under that same directive when no separate
      // worker-src is set. A CDN-hosted worker URL would violate it.
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      // Re-checked, not just relying on the guard above — TS can't
      // carry that narrowing into this async closure, since in
      // principle it could run after the ref changes.
      if (!container) return;
      container.replaceChildren();

      try {
        // Explicit local cMap/standard-font paths (copied from
        // node_modules by the postinstall script, same as the worker
        // above) — without these, pdf.js's default is to fetch them
        // from a CDN, which the CSP's connect-src ('self' plus the
        // app's own known domains) would then block for any PDF that
        // actually needs one. Only fetched on demand per-file, not
        // upfront, so this costs nothing for the scanned/image-only
        // PDFs most uploads here actually are.
        console.log("[pdfdebug] calling getDocument", url);
        const task = pdfjsLib.getDocument({
          url,
          cMapUrl: "/pdf-cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-standard-fonts/",
        });
        loadingTask = task;
        console.log("[pdfdebug] awaiting task.promise");
        const doc = await task.promise;
        console.log("[pdfdebug] got doc, numPages", doc.numPages);
        if (cancelled) {
          await task.destroy();
          return;
        }

        // Sized once against the modal's current width — the modal
        // itself is already responsive (see ResourceViewerDialog's
        // className), so whatever width it has at open time on
        // mobile/tablet/desktop is what pages render to fill, with no
        // horizontal overflow and no separate per-breakpoint logic
        // needed here.
        const containerWidth = container.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          if (cancelled) break;

          const page = await doc.getPage(pageNumber);
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth / unscaledViewport.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          // The canvas's actual pixel buffer is dpr-scaled for
          // sharpness; its CSS size is the un-scaled display size, so
          // it still occupies exactly containerWidth on screen.
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
          canvas.className = "mx-auto mb-3 block rounded-md bg-white shadow-md last:mb-0";
          container.appendChild(canvas);

          if (cancelled) break;
          const renderTask = page.render({ canvas, viewport });
          currentRenderTask = renderTask;
          await renderTask.promise;
          currentRenderTask = null;
          // Frees this page's parsed-content cache — with a
          // 50-100+ page scanned notes PDF, keeping every page's
          // intermediate render data alive after it's already
          // painted is the actual memory leak this guards against.
          page.cleanup();
        }

        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("[pdfdebug] error", err);
        if (!cancelled) setStatus("error");
      }
    }

    run();

    return () => {
      cancelled = true;
      currentRenderTask?.cancel();
      loadingTask?.destroy();
      container.replaceChildren();
    };
    // key={resource.file_url} on the caller's side (not this effect's
    // own deps) is what guarantees a fresh PdfViewer — and a fresh
    // "loading" state — per resource; see ResourceViewerDialog below.
  }, [url]);

  return (
    <div className="relative h-full w-full overflow-y-auto">
      {status === "loading" && (
        <div className="flex h-full items-center justify-center font-mono text-xs text-subtle-foreground">
          Loading…
        </div>
      )}
      {status === "error" && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load this file.</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-primary underline-offset-2 hover:underline active:underline"
          >
            Open in a new tab instead
          </a>
        </div>
      )}
      <div ref={containerRef} className={cn(status !== "ready" && "hidden")} />
    </div>
  );
}

/**
 * In-page preview so a student can look at a resource without
 * downloading it first. Images render directly; PDFs (most of what
 * gets uploaded here) go through PdfViewer above. Anything neither of
 * those can handle just isn't reachable — every upload is validated
 * to be a PDF or one of the listed image types at upload time (see
 * uploads/actions.ts's ALLOWED_CONTENT_TYPES).
 */
export function ResourceViewerDialog({
  resource,
  open,
  onOpenChange,
}: {
  resource: Viewable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl">
        <div className="flex flex-col gap-3 p-6 pb-0">
          <h2 className="pr-6 text-lg font-medium text-foreground">{resource?.title}</h2>
        </div>
        <div className="h-[70vh] px-6 pb-6">
          {resource &&
            (isImageUrl(resource.file_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resource.file_url}
                alt={resource.title}
                className="h-full w-full rounded-md object-contain"
              />
            ) : (
              // key={file_url}: a fresh PdfViewer instance per
              // resource, so switching between two PDFs (closing one,
              // opening another) is a clean mount/unmount rather than
              // this component trying to reset its own mid-render
              // state.
              <PdfViewer key={resource.file_url} url={resource.file_url} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
