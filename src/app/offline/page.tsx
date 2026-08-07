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
      <Image
        src="/images/no-internet-bg.png"
        alt=""
        fill
        priority
        className="object-cover"
      />
      {/* Dark overlay for text legibility — deliberately light (30%)
          so the artwork stays the visual focus, not hidden behind it. */}
      <div className="absolute inset-0 bg-black/30" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center"
      >
        <motion.div variants={item}>
          <WifiOff
            aria-hidden="true"
            size={56}
            strokeWidth={1.75}
            className="text-[#FF4A2D] opacity-95"
          />
        </motion.div>

        <motion.h1
          variants={item}
          className="font-mono text-[34px] font-medium tracking-[0.08em] text-[#F5F7FA] md:text-[42px] lg:text-[52px]"
          style={{ textShadow: "0 0 12px rgba(255,74,45,.15)" }}
        >
          No Internet
        </motion.h1>

        <motion.p variants={item} className={cn(inter.className, "text-[18px] text-[#A9B3C4]")}>
          Unable to connect to Sancturm.
        </motion.p>

        <motion.button
          variants={item}
          onClick={handleRetry}
          className={cn(
            "mt-2 rounded-[14px] border px-[34px] py-4 text-[#F5F7FA] transition-all duration-300",
            "bg-[rgba(20,20,25,0.35)] border-[rgba(255,255,255,0.12)] backdrop-blur-[18px]",
            "hover:scale-[1.03] hover:border-[rgba(255,74,45,0.5)] hover:shadow-[0_0_24px_rgba(255,74,45,0.25)]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4A2D]"
          )}
        >
          Retry
        </motion.button>
      </motion.div>
    </main>
  );
}
