"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { useBranch } from "@/hooks/useBranch";
import { useTerm } from "@/hooks/useTerm";
import { BranchSelectCard } from "@/features/branches/components/BranchSelectCard";
import { TermSelectCard } from "@/features/terms/components/TermSelectCard";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Branch } from "@/features/branches/types";
import type { AcademicTerm } from "@/types/database";

const HEADLINE = "Welcome to Sancturm";
const TYPING_SPEED_MS = 70;
const CURSOR_HOLD_MS = 1000;
const EXIT_DURATION_S = 0.8;

// Keeps the cursor's three visual states (blinking while typing, held
// solid, fading away) out of the main JSX below.
function cursorClassName(typingDone: boolean, cursorVisible: boolean) {
  if (!cursorVisible) {
    return "ml-1 inline-block w-[2px] text-primary opacity-0 transition-opacity duration-500";
  }
  if (!typingDone) {
    return "ml-1 inline-block w-[2px] animate-pulse text-primary";
  }
  return "ml-1 inline-block w-[2px] text-primary";
}

// Below this viewport aspect ratio (taller than roughly 9:10 — every
// phone in portrait, and most tablets in portrait), the 16:9 "contain"
// box from ASPECT_BREAKPOINT downward shrinks to a thin letterboxed
// strip with huge dead black bars top/bottom, and everything anchored
// to that strip gets squeezed into it. Below the threshold the video
// switches to full-viewport object-cover (cropped sides, no
// letterboxing) and the overlay anchors to the real viewport instead
// of a box — trading exact video-frame alignment (which only matters
// for the wide "cockpit window" look) for something that's actually
// usable on a phone held upright.
const PORTRAIT_QUERY = "(max-aspect-ratio: 0.9)";

function usePortraitLayout() {
  const [isPortrait, setIsPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to matchMedia, an external system
    setIsPortrait(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isPortrait;
}

// Separate from PORTRAIT_QUERY on purpose: that one also matches a
// tablet held upright (per its own comment), but only an actual phone
// should get the dedicated portrait-shot video — a tablet in portrait
// still gets the wide cockpit video (just via the isPortrait
// object-cover fallback below, unchanged). 640px matches the same
// mobile/desktop split (`sm:`) used everywhere else in the app.
const MOBILE_WIDTH_QUERY = "(max-width: 640px)";

function useIsMobileWidth() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_WIDTH_QUERY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to matchMedia, an external system
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function IntroExperience() {
  const router = useRouter();
  const { setBranch, isLoaded: branchLoaded } = useBranch();
  const { setTerm, isLoaded: termLoaded } = useTerm();
  const isLoaded = branchLoaded && termLoaded;
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const isPortrait = usePortraitLayout();
  const isMobileWidth = useIsMobileWidth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  // Year first, then branch — mirrors the sidebar switcher's two
  // independent selectors, and keeps each card asking exactly one
  // question instead of a single crowded picker.
  const [step, setStep] = useState<"term" | "branch">("term");
  const [exiting, setExiting] = useState(false);
  // Gates the typing sequence so the headline never starts animating
  // over a still-black screen on a slow connection — it used to fire
  // on a flat 700ms timer with no idea whether the video had actually
  // painted a frame yet. onLoadedData is the real signal; the fallback
  // timer is just so a video that fails to load (bad network, format
  // issue) doesn't leave the intro blank forever.
  const [videoReady, setVideoReady] = useState(false);

  // The video is always muted, so autoplay never needs a user gesture
  // or permission prompt — no gate button, no volume fade, no audio at
  // all. This call is just a defensive nudge for browsers that don't
  // reliably honor the autoPlay attribute on mount.
  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  useEffect(() => {
    const fallback = setTimeout(() => setVideoReady(true), 2500);
    return () => clearTimeout(fallback);
  }, []);

  // Every page after branch selection (Notes, PYQs, Notices, ...)
  // waits on useBranchBySlug before it can even start its own
  // resources query — a real network round trip, then a SECOND one
  // once the branch id comes back, stacked in sequence rather than in
  // parallel. Warming the cache here, while the person is just
  // watching the intro type out, means that first hop is already
  // sitting in cache by the time they land on /notes — one less round
  // trip on the connection that matters most (a cold cache, right
  // after picking a branch) instead of on every visit. One fetch
  // seeds both useBranches() (the list BranchSelectCard renders below)
  // and every individual useBranchBySlug(slug) a page might ask for.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("branches")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        const branches = (data as Branch[] | null) ?? [];
        queryClient.setQueryData(["branches"], branches);
        for (const branch of branches) {
          queryClient.setQueryData(["branch", branch.slug], branch);
        }
      });
    supabase
      .from("academic_terms")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        const terms = (data as AcademicTerm[] | null) ?? [];
        queryClient.setQueryData(["terms"], terms);
        for (const term of terms) {
          queryClient.setQueryData(["term", term.slug], term);
        }
      });
  }, [queryClient]);

  // The typing sequence: 700ms wait after the video is actually ready,
  // then one character at a time. Runs every time this page mounts —
  // including for a returning visitor who clicked back to "sancturm"
  // in the sidebar — rather than only ever showing it once.
  useEffect(() => {
    if (!isLoaded || !videoReady) return;
    if (prefersReducedMotion) {
      // Skipping straight to the finished state when the person has
      // reduced motion enabled is exactly what this effect is for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTypedText(HEADLINE);
      setTypingDone(true);
      return;
    }
    const startDelay = setTimeout(() => {
      let i = 0;
      const typingInterval = setInterval(() => {
        i++;
        setTypedText(HEADLINE.slice(0, i));
        if (i >= HEADLINE.length) {
          clearInterval(typingInterval);
          setTypingDone(true);
        }
      }, TYPING_SPEED_MS);
      typingIntervalRef.current = typingInterval;
    }, 700);
    return () => {
      clearTimeout(startDelay);
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, [isLoaded, videoReady, prefersReducedMotion]);

  // Once typing finishes: the cursor keeps blinking a moment longer
  // then fades away on its own, and the term card follows shortly
  // after.
  useEffect(() => {
    if (!typingDone) return;
    const cursorTimer = setTimeout(
      () => setCursorVisible(false),
      prefersReducedMotion ? 0 : CURSOR_HOLD_MS
    );
    const cardTimer = setTimeout(
      () => setShowSelector(true),
      prefersReducedMotion ? 0 : 600
    );
    return () => {
      clearTimeout(cursorTimer);
      clearTimeout(cardTimer);
    };
  }, [typingDone, prefersReducedMotion]);

  function handleTermSelect(slug: string) {
    setTerm(slug);
    setStep("branch");
  }

  function handleBranchSelect(slug: string) {
    setBranch(slug);
    setExiting(true);
    setTimeout(() => {
      router.push("/notes");
    }, EXIT_DURATION_S * 1000);
  }

  if (!isLoaded) return null;

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden bg-background"
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: EXIT_DURATION_S }}
    >
      {/* The video is 16:9 (1280x720). In landscape/wide viewports this
          box is sized with the classic CSS "contain" formula — width =
          min(100vw, 100vh * aspect), height = min(100vh, 100vw / aspect)
          — so it exactly matches the video's own rendered bounds, then
          centered. Every overlay below is positioned as a percentage of
          THIS box, not the raw viewport, so the composition (headline
          inside the "window", card above the "desk") stays consistent
          as the frame letterboxes top/bottom or side/side — anchoring
          to vh/vw directly broke on aspect ratios far from 16:9, where
          the video's visible content shifts away from the viewport
          edges but the text didn't follow it.

          In portrait (usePortraitLayout) that same contain formula
          shrinks the box to a thin horizontal sliver — e.g. ~211px
          tall on a 375×812 phone — squeezing all the overlay content
          into it with huge dead bars above/below. There the box
          becomes the full viewport instead and the video switches to
          object-cover (cropped sides, no letterboxing); exact
          video-frame alignment only mattered for the wide "cockpit
          window" look anyway. */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={
          isPortrait
            ? { width: "100vw", height: "100vh" }
            : {
                width: "min(100vw, calc(100vh * 16 / 9))",
                height: "min(100vh, calc(100vw * 9 / 16))",
              }
        }
      >
        {/* Background video — decorative only, not meaningful content,
            so it's hidden from screen readers and never keyboard-focusable.
            Always muted: no audio, no permission prompt, no controls.
            A phone-width viewport gets a dedicated portrait (9:16) shot
            instead of a cropped slice of the wide 16:9 one — same scene,
            framed so the window/stars area lines up with the headline's
            anchor point without cutting off the sides. Tablet and desktop
            keep the original video regardless of orientation. */}
        <video
          ref={videoRef}
          src={isMobileWidth ? "/videos/intro-mobile.mp4" : "/videos/intro-cockpit.mp4"}
          className={cn(
            "absolute inset-0 h-full w-full bg-background",
            isPortrait ? "object-cover" : "object-contain"
          )}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          onLoadedData={() => setVideoReady(true)}
        />
        <div className="absolute inset-0 bg-black/35" />

        {/* Positioned at 15% down the frame on tablet/desktop (the
            window/stars area) — not vertically centered, since
            centering would push the branch card further down each time
            a new piece fades in, until it overlaps the desk in the
            lower frame. On mobile the dedicated portrait video has more
            open sky above the desk, so the anchor sits a bit lower
            (19%) with room to spare before the desk. */}
        <div className="absolute inset-x-0 top-[19%] flex flex-col items-center gap-6 px-6 text-center sm:top-[15%]">
          {videoReady && (
            <h1
              className="whitespace-nowrap font-mono text-[24px] font-medium tracking-[0.02em] text-foreground sm:text-[30px] sm:tracking-[0.08em] md:text-[40px] lg:text-[56px]"
              style={{ textShadow: "0 0 10px rgba(77,168,255,.18)" }}
            >
              {typedText}
              <span className={cursorClassName(typingDone, cursorVisible)} aria-hidden="true">
                |
              </span>
            </h1>
          )}

          {showSelector && (
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mt-2 flex flex-col items-center gap-3"
            >
              {step === "term" ? (
                <TermSelectCard onSelect={handleTermSelect} />
              ) : (
                <>
                  <BranchSelectCard onSelect={handleBranchSelect} />
                  <button
                    type="button"
                    onClick={() => setStep("term")}
                    className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
                  >
                    ← change year
                  </button>
                </>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
