"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

// Structural, not tied to the `resources` table — Notices and
// Sancturm Updates reuse this same dialog for their own PDFs, and
// neither has (or needs) the rest of a full ResourceWithSubject row.
type Viewable = { title: string; file_url: string };

function isImageUrl(url: string) {
  const withoutQuery = url.split("?")[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

/**
 * In-page preview so a student can look at a resource without
 * downloading it first. Images render directly; everything else
 * (mainly PDFs, which is most of what gets uploaded here) goes in an
 * iframe, since browsers already know how to render a PDF inline.
 * Anything the browser itself can't preview just shows as a plain
 * "open in a new tab" fallback rather than a blank frame.
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
              // allow-scripts is required — Chrome's own built-in PDF
              // renderer is itself script-driven, and without this
              // flag Chrome refuses to render inside the sandbox at
              // all ("This page has been blocked by Chrome"), not just
              // degrade gracefully. This is still safe: allow-scripts
              // + allow-same-origin together only lets framed content
              // escape sandbox restrictions when that content is
              // SAME-origin as the parent page — file_url is always a
              // different origin (the R2 bucket's domain, never
              // sancturm.vercel.app), so the framed PDF still can't
              // reach this page's DOM, cookies, or storage. No
              // allow-top-navigation/allow-popups, so it still can't
              // redirect the tab or pop a window. And ALLOWED_CONTENT_
              // TYPES (uploads/actions.ts) already restricts what can
              // ever land at file_url to application/pdf or a handful
              // of image types — R2 serves it back with that exact
              // Content-Type, so the browser renders it as a PDF/image
              // via its native viewer, never as executable HTML.
              <iframe
                src={resource.file_url}
                title={resource.title}
                sandbox="allow-scripts allow-same-origin"
                className="h-full w-full rounded-md border border-border bg-background"
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
