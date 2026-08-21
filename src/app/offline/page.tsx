"use client";

import Image from "next/image";
import { Inter } from "next/font/google";
import { motion } from "framer-motion";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Scoped to just this page rather than added to the root layout —
// every other page in the app uses Space Grotesk / JetBrains Mono
// (see src/app/layout.tsx), this is the one deliberate exception.
const inter = Inter({ subsets: ["latin"], weight: ["400"] });

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

function handleRetry() {
  // Simplest honest behavior: attempt the reload. If the connection
  // is back, the real app loads; if not, this same page reappears —
  // no extra state machine needed for that "retry" to feel real.
  window.location.reload();
}

export default function OfflinePage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {/* unoptimized: this page's whole point is to render with no
          network available — going through Next's /_next/image
          resizing endpoint would need a live server round-trip it
          can't make. All three are pre-compressed WebPs (see
          OfflineWatcher's preload) so there's nothing left for the
          optimizer to usefully do anyway.
          Three images, not one <Image> with `sizes` — a distinct crop
          per tier, not just a resolution pick; `sizes` can't swap the
          actual artwork. sm/lg match the same mobile/tablet/desktop
          breakpoints used everywhere else in the app. */}
      <Image src="/media/error-mobile.webp" alt="" fill priority unoptimized className="object-cover sm:hidden" />
      <Image
        src="/media/error-tablet.webp"
        alt=""
        fill
        priority
        unoptimized
        className="hidden object-cover sm:block lg:hidden"
      />
      <Image
        src="/media/error-desktop.webp"
        alt=""
        fill
        priority
        unoptimized
        className="hidden object-cover lg:block"
      />
      {/* Content sized down proportionally from the original (see item
          22 of the redesign brief) — every piece scaled together, same
          approach as the Maintenance page's identical treatment. */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      >
        {/* A card of its own, not a wash over the background art — the
            media stays untouched at its own original colors/contrast;
            this is the "separate content layer" carrying the text's
            own readable background instead. Plain div, not its own
            motion item — icon/h1/p keep their original individually-
            staggered reveal (container's staggerChildren), this just
            gives that same group a shared background underneath it. */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-6">
          <motion.div variants={item}>
            <WifiOff aria-hidden="true" size={44} strokeWidth={1.75} className="text-primary opacity-95" />
          </motion.div>

          <motion.h1
            variants={item}
            className="font-mono text-[27px] font-medium tracking-[0.08em] text-foreground md:text-[34px] lg:text-[42px]"
            style={{ textShadow: "0 0 12px var(--glow-red)" }}
          >
            No Internet
          </motion.h1>

          <motion.p variants={item} className={cn(inter.className, "text-[15px] text-muted-foreground")}>
            Unable to connect to Sancturm.
          </motion.p>
        </div>

        <motion.button
          variants={item}
          onClick={handleRetry}
          className={cn(
            "mt-2 rounded-[14px] border px-7 py-3 text-foreground transition-all duration-300",
            "border-white/10 bg-black/35 backdrop-blur-[18px]",
            "hover:scale-[1.03] hover:border-primary/50 hover:shadow-[0_0_24px_-4px_var(--glow-red)]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          Retry
        </motion.button>
      </motion.div>
    </main>
  );
}
