"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
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
 * Fetches the PDF and renders pages onto <canvas> elements, top to
 * bottom in a normal scrolling column — not a native
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
 *
 * Pages render lazily, not all up front: this app's real content is
 * dominated by scanned-notes PDFs running 50-150+ pages, and eagerly
 * rendering every single one before showing anything reproduced the
 * exact "just sits there" complaint this was built to fix, just for a
 * different reason (CPU-bound sequential rendering instead of a
 * blocked viewer) — a 48-page file alone took over two minutes render
 * fully before the old version marked itself "ready". Page 1 renders
 * eagerly so there's something to look at immediately; every other
 * page gets a correctly-sized placeholder up front (so scrolling and
 * the scrollbar are stable) and only actually renders once it
 * scrolls near the viewport, via IntersectionObserver — the same
 * approach PDF.js's own reference viewer and most production PDF
 * viewers use for exactly this reason.
 */
function PdfViewer({ url }: { url: string }) {
  // Two refs, not one: containerRef (the canvas host) is hidden via
  // `hidden` (display:none) while loading, so a display:none element's
  // clientWidth is always 0 — reading page-render width off it produced
  // 0×0 canvases that "rendered" successfully but painted nothing
  // visible. wrapperRef is the outer scroll area, which is never
  // hidden, so it always reports the real width.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    // destroy() lives on the loading task, not the resolved
    // PDFDocumentProxy — it tears down the underlying worker/transport
    // regardless of whether the load ever actually resolved, which is
    // exactly what's needed if the dialog closes mid-fetch.
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let observer: IntersectionObserver | null = null;
    const activeRenderTasks = new Map<number, RenderTask>();
    const renderedPages = new Set<number>();
    // Captured once, not re-read as containerRef.current inside the
    // cleanup below — by the time cleanup runs the ref may already
    // point elsewhere (or nowhere), but this element is still the one
    // whose children this effect actually appended.
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    async function run() {
      const pdfjsLib = await import("pdfjs-dist");
      // Served from public/ (copied from node_modules by the
      // postinstall script — see package.json) specifically so this
      // is same-origin: the CSP's script-src is 'self', and a worker
      // script falls under that same directive when no separate
      // worker-src is set. A CDN-hosted worker URL would violate it.
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      // Re-checked, not just relying on the guard above — TS can't
      // carry that narrowing into this async closure, since in
      // principle it could run after the ref changes.
      if (!container || !wrapper) return;
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
        const task = pdfjsLib.getDocument({
          url,
          cMapUrl: "/pdf-cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdf-standard-fonts/",
        });
        loadingTask = task;
        const doc = await task.promise;
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
        const containerWidth = wrapper.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);

        async function renderPage(pageNumber: number, page: PDFPageProxy, placeholder: HTMLDivElement) {
          if (renderedPages.has(pageNumber) || cancelled) return;
          renderedPages.add(pageNumber);

          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = (containerWidth / unscaledViewport.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          // The canvas's actual pixel buffer is dpr-scaled for
          // sharpness; its CSS size fills the placeholder (which is
          // already sized to the display dimensions), so it still
          // occupies exactly containerWidth on screen.
          canvas.className = "block h-full w-full rounded-md bg-white shadow-md";
          placeholder.replaceChildren(canvas);

          if (cancelled) return;
          const renderTask = page.render({ canvas, viewport });
          activeRenderTasks.set(pageNumber, renderTask);
          try {
            await renderTask.promise;
          } catch {
            // A cancelled render task rejects — expected when the
            // dialog closes or this resource is switched away from
            // mid-render, not a real failure to surface.
          } finally {
            activeRenderTasks.delete(pageNumber);
            // Frees this page's parsed-content cache — with a
            // 50-150+ page scanned notes PDF, keeping every visited
            // page's intermediate render data alive after it's
            // already painted is the actual memory leak this guards
            // against.
            page.cleanup();
          }
        }

        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        const firstUnscaled = firstPage.getViewport({ scale: 1 });
        // Every subsequent page's placeholder is pre-sized off page
        // 1's aspect ratio — true for the overwhelming majority of
        // real documents (uniform page size throughout), and even
        // when a later page's actual size differs slightly, it's a
        // one-time layout nudge when that page renders rather than
        // something that blocks anything up front.
        const pageAspectRatio = firstUnscaled.height / firstUnscaled.width;
        const placeholderHeight = Math.round(containerWidth * pageAspectRatio);

        const placeholders: HTMLDivElement[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          const placeholder = document.createElement("div");
          placeholder.style.height = `${placeholderHeight}px`;
          placeholder.className = "mx-auto mb-3 last:mb-0";
          placeholder.dataset.pageNumber = String(pageNumber);
          container.appendChild(placeholder);
          placeholders.push(placeholder);
        }

        await renderPage(1, firstPage, placeholders[0]);
        if (cancelled) return;
        // First page is visible — no reason to keep the rest of the
        // document behind a spinner while they render lazily below.
        setStatus("ready");

        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
              if (renderedPages.has(pageNumber)) continue;
              doc
                .getPage(pageNumber)
                .then((page) => renderPage(pageNumber, page, placeholders[pageNumber - 1]));
            }
          },
          // Starts rendering a page slightly before it's actually
          // scrolled into view, so it's already painted by the time
          // it reaches the visible area instead of popping in.
          { root: container, rootMargin: "600px 0px" }
        );
        for (const placeholder of placeholders) observer.observe(placeholder);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    run();

    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const task of activeRenderTasks.values()) task.cancel();
      loadingTask?.destroy();
      container.replaceChildren();
    };
    // key={resource.file_url} on the caller's side (not this effect's
    // own deps) is what guarantees a fresh PdfViewer — and a fresh
    // "loading" state — per resource; see ResourceViewerDialog below.
  }, [url]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full overflow-y-auto">
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
