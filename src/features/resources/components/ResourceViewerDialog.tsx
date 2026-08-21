"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UploadProgress } from "@/components/shared/UploadProgress";
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

// Module-level, not component state — this is what actually survives
// the dialog closing (Radix unmounts PdfViewer entirely, see its own
// key={file_url} comment below) and reopening the SAME resource a
// moment later. Caches the document's raw bytes, not the parsed
// PDFDocumentProxy itself — that object owns a live worker/transport
// that the cleanup effect below deliberately destroy()s on close, so
// trying to keep IT alive across a full unmount would mean either
// skipping that teardown (a real resource leak every time a DIFFERENT
// PDF opens next) or fighting pdf.js's own lifecycle. Raw bytes have
// no such lifecycle — re-parsing already-in-memory bytes via
// getDocument({ data }) is fast (no network wait) and starts fully
// clean every time.
//
// Capped at a handful of entries (LRU via Map's insertion-order
// re-set-on-hit trick), not unbounded — a scanned-notes PDF can run
// tens of MB, and this app's own upload cap is 100MB; caching every
// PDF anyone has ever opened this session for free would be a real
// memory problem on a lower-end phone. A few recently-viewed files is
// what "reuse already fetched data when safe" is actually asking for,
// not an unbounded cache.
const MAX_CACHED_PDFS = 3;
const pdfBytesCache = new Map<string, ArrayBuffer>();

function cachePdfBytes(url: string, bytes: ArrayBuffer) {
  pdfBytesCache.delete(url); // re-inserting moves it to the end (most-recent)
  pdfBytesCache.set(url, bytes);
  while (pdfBytesCache.size > MAX_CACHED_PDFS) {
    const oldest = pdfBytesCache.keys().next().value;
    if (oldest === undefined) break;
    pdfBytesCache.delete(oldest);
  }
}

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
  // Fraction 0-1 of the initial document fetch (the bytes needed to
  // open the file and read page 1) — null until pdf.js reports a
  // known total, which large scanned PDFs on a slow connection can
  // take a moment to do, and again null once loading finishes so a
  // stale bar can't linger.
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // destroy() lives on the loading task, not the resolved
    // PDFDocumentProxy — it tears down the underlying worker/transport
    // regardless of whether the load ever actually resolved, which is
    // exactly what's needed if the dialog closes mid-fetch.
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let rafId: number | null = null;
    let scrollHandler: (() => void) | null = null;
    let resizeRafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
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
        //
        // A cache hit (see pdfBytesCache's own comment) passes the
        // already-downloaded bytes straight to pdf.js via `data`
        // instead of `url` — no network fetch at all, so there's
        // nothing for onProgress to report and this reopens near-
        // instantly instead of re-fetching from scratch.
        const cachedBytes = pdfBytesCache.get(url);
        const task = cachedBytes
          ? pdfjsLib.getDocument({
              data: cachedBytes,
              cMapUrl: "/pdf-cmaps/",
              cMapPacked: true,
              standardFontDataUrl: "/pdf-standard-fonts/",
            })
          : pdfjsLib.getDocument({
              url,
              cMapUrl: "/pdf-cmaps/",
              cMapPacked: true,
              standardFontDataUrl: "/pdf-standard-fonts/",
            });
        loadingTask = task;
        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (!cancelled && total) setProgress(loaded / total);
        };
        const doc = await task.promise;
        if (cancelled) {
          await task.destroy();
          return;
        }
        setProgress(null);

        // Best-effort — pdf.js keeps the full document bytes in memory
        // once loaded (for anything not using its own range-request
        // streaming, which this app's file sizes never trigger), so
        // this is just handing that already-in-memory data to the
        // cache for next time, not a second download. Never blocks
        // rendering on this — a caching miss just means the next open
        // re-fetches, same as today.
        if (!cachedBytes) {
          doc
            .getData()
            .then((bytes: Uint8Array) => {
              if (!cancelled) cachePdfBytes(url, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
            })
            .catch(() => {
              // Orphaned cache opportunity, not a real failure — the
              // document already loaded successfully either way.
            });
        }

        // Fit-to-page, not fit-to-width: the old `scale =
        // containerWidth / pageWidth` filled the viewer's width and
        // let height do whatever it wanted, which for any page taller
        // (in aspect ratio) than the viewer's own box — the common
        // case, since a portrait scanned page in a wide desktop dialog
        // almost always is — cropped the bottom behind an internal
        // scroll instead of showing the whole page at once. Fitting
        // against BOTH available dimensions (whichever is more
        // constraining wins) guarantees the complete page is visible
        // top-to-bottom the moment it renders, on every breakpoint,
        // with no separate mobile/tablet/desktop logic needed — same
        // "Fit Page" behavior a native PDF viewer defaults to.
        //
        // fitScaleRef (not a local const) because it's recomputed by
        // recomputeFit() below whenever the wrapper resizes (a window
        // resize, an orientation change, or the dialog itself changing
        // size) — every call site that reads it does so at call time,
        // never captures a stale value.
        const fitScaleRef = { current: 1 };
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);
        // Small breathing room so a fitted page doesn't touch the
        // scroll container's literal edge — "minimal surrounding empty
        // space", not a layout gutter.
        const FIT_MARGIN_PX = 8;

        function computeFitScale(nativeWidth: number, nativeHeight: number): number {
          const availableWidth = wrapper!.clientWidth - FIT_MARGIN_PX * 2;
          const availableHeight = wrapper!.clientHeight - FIT_MARGIN_PX * 2;
          if (nativeWidth <= 0 || nativeHeight <= 0 || availableWidth <= 0 || availableHeight <= 0) return 1;
          return Math.min(availableWidth / nativeWidth, availableHeight / nativeHeight);
        }

        async function renderPage(pageNumber: number, page: PDFPageProxy, placeholder: HTMLDivElement) {
          if (renderedPages.has(pageNumber) || cancelled) return;
          renderedPages.add(pageNumber);

          const viewport = page.getViewport({ scale: fitScaleRef.current * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          // The canvas's actual pixel buffer is dpr-scaled for
          // sharpness; its CSS size fills the placeholder, which is
          // already sized (in both dimensions) to the fitted display
          // size, so it occupies exactly that fitted box on screen.
          canvas.className = "block h-full w-full rounded-md bg-white shadow-md";
          placeholder.replaceChildren(canvas);

          if (cancelled) return;
          const renderTask = page.render({ canvas, viewport });
          activeRenderTasks.set(pageNumber, renderTask);
          try {
            await renderTask.promise;
          } catch {
            // A cancelled render task rejects — expected when the
            // dialog closes, this resource is switched away from, or
            // this exact page is evicted mid-render (see evictPage
            // below) — not a real failure to surface.
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

        // The canvas itself — not just pdf.js's own per-page cache
        // (page.cleanup() above) — is a real, uncollected cost: every
        // rendered page stays a live, full-resolution GPU-backed
        // surface the compositor has to account for on every scroll
        // frame. On a real phone, a 40-50 page document with every
        // visited page still "alive" is exactly what turned scrolling
        // heavy and made taps (e.g. the dialog's own close button)
        // feel unresponsive — the render/compositing work was
        // crowding out input handling on the main thread. Evicting a
        // page once it's scrolled well past the keep-alive margin
        // below turns this into real virtualization: only pages near
        // the viewport are ever live at once, matching what the
        // reference PDF.js viewer does for the same documents.
        function evictPage(pageNumber: number, placeholder: HTMLDivElement) {
          const queueIndex = renderQueue.indexOf(pageNumber);
          if (queueIndex !== -1) renderQueue.splice(queueIndex, 1);
          if (!renderedPages.has(pageNumber)) return;
          renderedPages.delete(pageNumber);
          activeRenderTasks.get(pageNumber)?.cancel();
          activeRenderTasks.delete(pageNumber);
          placeholder.replaceChildren();
        }

        // Pages render one at a time, not however many the scroll
        // handler finds near the viewport at once — a fast flick
        // through a long document could otherwise fire a dozen
        // simultaneous canvas render tasks, each real main-thread/GPU
        // work, which is exactly what turned scrolling heavy on lower-
        // end phones. A small serial queue keeps at most one page
        // actively rendering, so input handling (including scroll
        // itself) never has to compete with a pile of render work.
        const renderQueue: number[] = [];
        let isDrainingQueue = false;

        function enqueueRender(pageNumber: number) {
          if (renderedPages.has(pageNumber) || renderQueue.includes(pageNumber)) return;
          renderQueue.push(pageNumber);
          void drainQueue();
        }

        async function drainQueue() {
          if (isDrainingQueue) return;
          isDrainingQueue = true;
          while (renderQueue.length > 0 && !cancelled) {
            const pageNumber = renderQueue.shift();
            if (pageNumber === undefined || renderedPages.has(pageNumber)) continue;
            const placeholder = placeholders[pageNumber - 1];
            const page = await doc.getPage(pageNumber);
            if (cancelled) break;
            await renderPage(pageNumber, page, placeholder);
          }
          isDrainingQueue = false;
        }

        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        const firstUnscaled = firstPage.getViewport({ scale: 1 });
        // Every subsequent page's placeholder is pre-sized off page
        // 1's own native dimensions — true for the overwhelming
        // majority of real documents (uniform page size throughout),
        // and even when a later page's actual size differs slightly,
        // it's a one-time layout nudge when that page renders rather
        // than something that blocks anything up front.
        fitScaleRef.current = computeFitScale(firstUnscaled.width, firstUnscaled.height);
        let placeholderWidth = Math.round(firstUnscaled.width * fitScaleRef.current);
        let placeholderHeight = Math.round(firstUnscaled.height * fitScaleRef.current);

        const placeholders: HTMLDivElement[] = [];
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
          const placeholder = document.createElement("div");
          placeholder.style.width = `${placeholderWidth}px`;
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

        // Plain scroll-position math, not IntersectionObserver: this
        // component's first cut used IntersectionObserver with
        // root: wrapper, and it silently never fired for pages that
        // scrolled into view after the initial batch — page 1 stayed
        // rendered but nothing further down ever did, no error, no
        // hang, just permanently blank placeholders past whatever was
        // visible on open. Rather than chase exactly which observer
        // edge case caused that, offsetTop vs. scrollTop is simple
        // enough to reason about directly and doesn't depend on any
        // browser's IntersectionObserver timing/batching behavior.
        const KEEP_ALIVE_MARGIN_PX = 500;

        function updateVisiblePages() {
          if (cancelled || !wrapper) return;
          const top = wrapper.scrollTop - KEEP_ALIVE_MARGIN_PX;
          const bottom = wrapper.scrollTop + wrapper.clientHeight + KEEP_ALIVE_MARGIN_PX;
          for (let i = 0; i < placeholders.length; i++) {
            const pageNumber = i + 1;
            const placeholder = placeholders[i];
            const placeholderTop = placeholder.offsetTop;
            const placeholderBottom = placeholderTop + placeholder.offsetHeight;
            const nearViewport = placeholderBottom > top && placeholderTop < bottom;
            if (nearViewport) {
              enqueueRender(pageNumber);
            } else {
              evictPage(pageNumber, placeholder);
            }
          }
        }

        function onScroll() {
          // Coalesces to at most one recheck per animation frame,
          // regardless of how many scroll events fire in between —
          // scroll fires far more often than the page actually needs
          // to be re-evaluated.
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            updateVisiblePages();
          });
        }

        scrollHandler = onScroll;
        wrapper.addEventListener("scroll", onScroll, { passive: true });
        updateVisiblePages();

        // Recomputes the fit whenever the viewer's own box changes —
        // a browser window resize, a device orientation flip, or
        // (since this observes the wrapper element itself) the dialog
        // being resized by anything else in its layout. ResizeObserver
        // over a plain window "resize" listener specifically because
        // orientation changes and dialog-level layout shifts don't
        // reliably fire "resize" on window at all on some mobile
        // browsers, but always change this element's own box.
        function recomputeFit() {
          if (cancelled || !wrapper) return;
          const newScale = computeFitScale(firstUnscaled.width, firstUnscaled.height);
          // Ignores sub-percent jitter (ResizeObserver can fire for a
          // fraction-of-a-pixel layout settle) so this doesn't evict
          // and re-render every visible page over nothing.
          if (Math.abs(newScale - fitScaleRef.current) / fitScaleRef.current < 0.01) return;
          fitScaleRef.current = newScale;
          placeholderWidth = Math.round(firstUnscaled.width * newScale);
          placeholderHeight = Math.round(firstUnscaled.height * newScale);
          for (const placeholder of placeholders) {
            placeholder.style.width = `${placeholderWidth}px`;
            placeholder.style.height = `${placeholderHeight}px`;
          }
          // Whatever was already rendered was rendered at the OLD
          // scale — evicting and letting updateVisiblePages() below
          // re-enqueue reuses the exact same render path a normal
          // scroll-into-view already goes through, rather than a
          // second, parallel "resize re-render" code path to keep in
          // sync with it.
          for (const pageNumber of [...renderedPages]) {
            evictPage(pageNumber, placeholders[pageNumber - 1]);
          }
          updateVisiblePages();
        }

        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId !== null) return;
          resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            recomputeFit();
          });
        });
        resizeObserver.observe(wrapper);
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    run();

    return () => {
      cancelled = true;
      if (scrollHandler) wrapper.removeEventListener("scroll", scrollHandler);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeObserver?.disconnect();
      for (const task of activeRenderTasks.values()) task.cancel();
      loadingTask?.destroy();
      container.replaceChildren();
    };
    // key={resource.file_url} on the caller's side (not this effect's
    // own deps) is what guarantees a fresh PdfViewer — and a fresh
    // "loading" state — per resource; see ResourceViewerDialog below.
  }, [url]);

  return (
    <div
      ref={wrapperRef}
      // overscroll-contain: without it, scrolling this inner column
      // past its own top/bottom "leaks" the gesture into the page
      // behind the dialog (rubber-banding the whole tab) — the exact
      // kind of jank that reads as "scrolling is laggy" on a touch
      // device, even though the PDF itself scrolled fine.
      className="relative h-full w-full overflow-y-auto overscroll-y-contain"
    >
      {status === "loading" && (
        <div className="flex h-full items-center justify-center px-10">
          {progress === null ? (
            <p className="font-mono text-xs text-subtle-foreground">Loading…</p>
          ) : (
            <div className="w-full max-w-xs">
              <UploadProgress fraction={progress} label="Loading" />
            </div>
          )}
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
  fitImage = false,
}: {
  resource: Viewable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Default (false) keeps the deliberate natural-size + scroll
  // treatment below — right for a scanned notebook photo, which is
  // routinely far taller than the dialog and would go illegible if
  // shrunk to fit. A CR card is a single fixed-aspect image (a
  // portrait ID-card shape, not a multi-page document) where the
  // opposite is true: seeing the WHOLE card at once is the point, so
  // TeamList passes fitImage to scale it down instead.
  fitImage?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl">
        <div className="flex flex-col gap-3 p-6 pb-0">
          <h2 className="pr-6 text-lg font-medium text-foreground">{resource?.title}</h2>
        </div>
        {/* min-h-0 matters: DialogContent is a CSS grid, and a grid
            item's default min-height is its content's own min-content
            size, not the h-[70vh] set here — without it, a large image
            can force this row (and the whole dialog) taller than
            max-h-[85vh], pushing the top of the page off-screen with
            nothing to scroll it back into view. Deliberately NOT a flex
            container (an earlier version wrapped this in flex/items-
            center to "help" centering) — that just moves the exact same
            min-height:auto blowout one level down onto the <img> itself,
            since flex items get the same content-based auto-minimum
            grid items do. Plain block layout has no such rule, so
            height:100% on the img resolves cleanly against this div's
            now-properly-bounded height with no equivalent trap.

            overflow-y-auto (not overflow-hidden): a scanned notebook
            photo is very often taller than it is wide, sometimes far
            taller than a 70vh box on a normal laptop screen —
            object-contain used to force the WHOLE image to shrink down
            to fit inside that fixed box, which for a tall photo meant
            either a barely-legible thumbnail or, depending on how the
            surrounding grid resolved, the bottom portion clipped
            outright with no way to reach it. Rendering the image at its
            natural size (full container width, height auto) and
            letting this box scroll instead — the same treatment
            PdfViewer's own wrapper already gives multi-page PDFs — means
            the whole page is always reachable at a readable size,
            never shrunk past legibility and never cropped. */}
        <div
          className={cn(
            "h-[70vh] min-h-0 px-6 pb-6",
            fitImage ? "overflow-hidden" : "overflow-y-auto"
          )}
        >
          {resource &&
            (isImageUrl(resource.file_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resource.file_url}
                alt={resource.title}
                className={cn(
                  "mx-auto rounded-md",
                  fitImage ? "h-full w-full object-contain" : "w-full"
                )}
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
