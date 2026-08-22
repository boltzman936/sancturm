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
      // will-change promotes this to its own compositor layer before
      // the first paint instead of on it — without it, backdrop-blur
      // can render one frame unblurred (a plain translucent white
      // panel) before the browser actually applies the filter, which
      // read as the glass "turning on" a beat after the card appeared.
      style={{ willChange: "backdrop-filter" }}
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
        // a big one reads as a modal. A further ~10% pass (200/215/
        // 250px, was 220/240/280) on top of that, plus one step back up
        // at xl (300px, ≥1280px) — a large/high-res laptop has enough
        // room that 250px read as lost/undersized against the frame,
        // not "compact." Then trimmed again at lg/xl specifically (230/
        // 270px, was 250/300) — a real laptop screen (the common case
        // at both those widths) read the 250/300px card as a touch
        // large against the frame; mobile/sm (200/215px) untouched,
        // this pass is desktop-only. backdrop-saturate dropped from 150 to 100
        // (i.e. off, not boosted) — saturate-150 was punching up
        // whatever hue sits behind the glass, so a warm/cream sky (like
        // this artwork's) came through MORE vivid through the "glass"
        // than the sky itself, reading as a solid warm block instead of
        // neutral frosted glass. Plain backdrop-blur without a
        // saturation boost is what actually looks like glass over any
        // background hue, not just cool ones.
        // bg-black/22 (was bg-white/10) — a light glass tint was still
        // reading as "too bright/washed out" specifically over the
        // artwork's brighter passages (cream sky), where a near-white
        // panel barely separated from what's behind it. A dark tint
        // gives the panel a consistent identity of its own — it now
        // reads as a distinct floating surface over EITHER a bright or
        // dark part of the image, not just a slight haze over whatever
        // is underneath. Still translucent (22% opacity, not solid)
        // and still blurred — only the tint changed; blur/border/
        // shadow/radius are untouched.
        "w-full max-w-[200px] rounded-2xl border border-white/15 bg-black/22 p-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.18)] backdrop-blur-md sm:max-w-[215px] sm:p-3 lg:max-w-[230px] lg:p-2.5 xl:max-w-[270px]",
        className
      )}
    >
      {/* mb-2.5/gap-1/py-2 (was mb-3/gap-1.5/py-2.5) — a second ~10%
          rhythm pass on every tier, not just mobile/tablet this time,
          matching the card's own outer shrink above. */}
      {/* Fixed white, not a text-foreground/theme token — this card
          always sits over the Cockpit's photographic background art,
          never over a themed surface, so its text needs to stay
          legible against that art regardless of which theme/mode the
          student has picked (a dark-mode foreground token would go
          near-black here in some themes). Full opacity + medium weight
          (was /80, regular weight) now that the panel itself is a dark
          tint (see the panel's own comment) — white text needs less
          help standing out against a consistently dark surface, but
          the higher opacity/weight is what was asked for as "increase
          contrast/weight," done via strength rather than switching to
          a dark color that would go straight back to low-contrast
          against this now-dark glass. */}
      {/* lg:mb-2 (was mb-3.5), lg:gap-1 + lg:py-2 below (was gap-1.5/
          py-2.5) — a further desktop-only height trim on top of the
          card's own outer shrink above; mobile/tablet spacing
          untouched. */}
      <h2 className="mb-2.5 text-center font-mono text-xs font-medium tracking-[0.08em] text-white lg:mb-2">{title}</h2>
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="flex flex-col gap-1 lg:gap-1"
            aria-live="polite"
            aria-label={loadingLabel}
          >
            {/* Same border/padding/rounded box as the real option
                buttons below (not a fixed pixel height) — a skeleton
                with its own guessed height swapped out for a
                differently-sized real button is exactly what read as
                the panel visibly resizing between its loading and
                loaded state. Mirroring the button's own box makes the
                swap a pure content/shimmer change at a fixed size. */}
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div
                key={i}
                className="animate-shimmer rounded-lg border border-white/15 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%] px-3.5 py-2 lg:px-4 lg:py-2"
                style={{ animationDelay: reduceMotion ? "0s" : `${i * 0.08}s` }}
              >
                &nbsp;
              </div>
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
            <p className="font-mono text-xs text-white/85">{errorLabel}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-primary active:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="flex flex-col gap-1 lg:gap-1"
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
                className="rounded-lg border border-white/15 bg-white/5 px-3.5 py-2 text-left font-medium text-white transition-[color,background-color,border-color,box-shadow] duration-200 hover:border-primary active:border-primary hover:bg-white/15 active:bg-white/15 hover:shadow-[0_0_20px_-4px_var(--glow-red)] active:shadow-[0_0_20px_-4px_var(--glow-red)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-4 lg:py-2"
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
