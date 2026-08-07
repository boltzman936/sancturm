"use client";

import { useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function OwnerPhoto({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt}'s photo`}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* priority: this is the one photo on the page — it should
            load with the same urgency as the page itself, not get
            deprioritized behind fonts/scripts the way a plain <img>
            can be by the browser's own heuristics. */}
        <Image
          src={src}
          alt={alt}
          width={128}
          height={128}
          priority
          className="h-32 w-32 rounded-full border-2 border-border object-cover object-center transition-opacity hover:opacity-90"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-none bg-transparent p-0 shadow-none">
          {/* eslint-disable-next-line @next/next/no-img-element -- variable-height lightbox, not worth next/image's fixed-dimension config here */}
          <img src={src} alt={alt} className="max-h-[80vh] w-full rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
