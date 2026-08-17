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
        // No backdrop-blur: with a playing video behind it, blur has to
        // be resampled by the GPU on every frame, not just once — that
        // was the actual source of the jank. A near-opaque solid
        // background gets the same dark-glass look for free.
        "w-full max-w-sm rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl",
        className
      )}
    >
      <h2 className="mb-4 text-center font-mono text-xs tracking-[0.08em] text-muted-foreground">{title}</h2>
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex flex-col gap-2"
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
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-foreground transition-[color,background-color,border-color,box-shadow] duration-200 hover:border-primary active:border-primary hover:bg-white/10 active:bg-white/10 hover:shadow-[0_0_20px_rgba(255,74,45,0.15)] active:shadow-[0_0_20px_rgba(255,74,45,0.15)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
