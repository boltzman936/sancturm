"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function OwnerPhoto({
  src,
  fullSrc,
  alt,
}: {
  // A dedicated square, retina-sized crop for the small avatar button —
  // sized for how it's actually displayed (128 CSS px, so up to 384
  // physical px on a 3x phone), not a downscaled thumbnail of the raw
  // upload, which is what made this look soft/blurry before. fullSrc
  // is the untouched original, only ever fetched on demand when the
  // lightbox opens, so full quality there costs nothing on page load.
  src: string;
  fullSrc: string;
  alt: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt}'s photo`}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* priority: loads with the same urgency as the page itself,
            not deprioritized behind fonts/scripts. unoptimized: the
            source file is already sized/cropped for this display size —
            skipping Vercel's on-demand image transform means the very
            first request serves the static file directly instead of
            waiting on a cold transform before it's cached at the edge. */}
        <Image
          src={src}
          alt={alt}
          width={224}
          height={224}
          priority
          unoptimized
          className="h-28 w-28 rounded-full border-2 border-border object-cover object-center transition-opacity hover:opacity-90"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-none bg-transparent p-0 shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- variable-height lightbox, not worth next/image's fixed-dimension config here */}
          <img src={fullSrc} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
