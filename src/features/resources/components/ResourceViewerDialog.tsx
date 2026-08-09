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
              // sandbox with no allow-scripts/allow-top-navigation/
              // allow-popups: the browser's native PDF renderer needs
              // no script execution to work, so this costs nothing for
              // the legitimate case, while making sure that whatever
              // ends up at file_url — regardless of what upload
              // validation allows today or might miss tomorrow — can
              // never run script, redirect the tab, or pop a window.
              // allow-same-origin is what lets the native PDF viewer
              // render at all in a sandboxed frame.
              <iframe
                src={resource.file_url}
                title={resource.title}
                sandbox="allow-same-origin"
                className="h-full w-full rounded-md border border-border bg-background"
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
