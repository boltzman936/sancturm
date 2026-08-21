"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Shared "pick one" card used by Cockpit's Branch/Specialization/Year
 * steps — cross-fades between loading/error/content instead of
 * snapping between them, and staggers each option in on arrival. Data
 * fetching and labels stay with each caller; this only owns the
 * loading→content feel, so all three cards get it for free and can't
 * drift out of sync with each other.
 */
export function SelectCard<T>({
  title,
  items,
  isLoading,
  isError,
  onRetry,
  onSelect,
  getKey,
  getLabel,
  skeletonCount,
  loadingLabel,
  errorLabel,
  className,
}: {
  title: string;
  items: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (item: T) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  skeletonCount: number;
  loadingLabel: string;
  errorLabel: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        // Liquid-glass treatment — frosted (backdrop-blur + saturate),
        // translucent white overlay, a thin bright edge and a
        // restrained shadow for depth, same recipe as Apple's own
        // frosted panels. A modest blur radius (md, ~12px) rather than
        // an extreme one keeps this affordable even on mobile, the one
        // tier where the backdrop is still a playing video (tablet/
        // desktop sit over a static image, where blur cost is a
        // one-time paint, not a per-frame resample) — an earlier
        // version of this card skipped blur entirely for that reason;
        // "md" is the deliberate middle ground, not an oversight. Only
        // this card's own bounds are blurred — never the page behind
        // it — so the background media stays sharp everywhere outside
        // this small box. Compact by design, and smaller still on
        // mobile/tablet (220px) than desktop (280px) — a card sized
        // for a laptop screen was disproportionately large against a
        // phone/tablet's own much smaller viewport; a small, subtle
        // panel reads as premium against full-bleed art at every size,
        // a big one reads as a modal.
        "w-full max-w-[220px] rounded-2xl border border-white/20 bg-white/10 p-3 shadow-[0_4px_20px_rgba(0,0,0,0.18)] backdrop-blur-md backdrop-saturate-150 sm:max-w-[240px] sm:p-3.5 lg:max-w-[280px] lg:p-4",
        className
      )}
    >
      {/* mb-3/gap-1.5/py-2.5 on mobile+tablet (~10% shorter overall
          than desktop's mb-4/gap-2/py-3, not a flat shrink) — still a
          real ~40px tap target with normal line-height, just tighter
          rhythm between title/options so the whole card takes less
          vertical room on a phone/tablet screen. */}
      <h2 className="mb-3 text-center font-mono text-xs tracking-[0.08em] text-foreground/80 lg:mb-4">{title}</h2>
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex flex-col gap-1.5 lg:gap-2"
            aria-live="polite"
            aria-label={loadingLabel}
          >
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div
                key={i}
                className="h-[46px] animate-shimmer rounded-lg bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%]"
                style={{ animationDelay: reduceMotion ? "0s" : `${i * 0.08}s` }}
              />
            ))}
          </motion.div>
        ) : isError ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="flex flex-col items-center gap-3 py-2 text-center"
          >
            <p className="font-mono text-xs text-subtle-foreground">{errorLabel}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Retry
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex flex-col gap-2"
          >
            {items?.map((item, i) => (
              <motion.button
                key={getKey(item)}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.35,
                  delay: reduceMotion ? 0 : i * 0.05,
                  ease: EASE,
                }}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => onSelect(item)}
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-left text-foreground transition-[color,background-color,border-color,box-shadow] duration-200 hover:border-primary active:border-primary hover:bg-white/15 active:bg-white/15 hover:shadow-[0_0_20px_-4px_var(--glow-red)] active:shadow-[0_0_20px_-4px_var(--glow-red)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:py-3"
              >
                {getLabel(item)}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
