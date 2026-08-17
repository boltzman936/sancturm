"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { useBranch } from "@/hooks/useBranch";
import { useTerm } from "@/hooks/useTerm";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useBranches } from "@/features/branches/queries";
import { BranchSelectCard } from "@/features/branches/components/BranchSelectCard";
import { SpecializationSelectCard } from "@/features/branches/components/SpecializationSelectCard";
import { TermSelectCard } from "@/features/terms/components/TermSelectCard";
import { createClient } from "@/lib/supabase/client";
import { localDateKey } from "@/lib/date";
import { isDateReached } from "@/features/batches/academicChronology";
import { cn } from "@/lib/utils";
import type { Branch } from "@/features/branches/types";
import type { AcademicTerm, Specialization } from "@/types/database";

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

// Lazy initializer (not useState(false) + an effect-set value) so the
// FIRST client render already has the real answer, not a placeholder
// that flips a moment later. That flip used to matter a lot here: the
// video <source> below depends on this same class of check
// (useIsMobileWidth), and briefly rendering the WRONG one meant the
// browser started fetching the desktop cockpit video, then aborted
// and re-fetched the actual mobile one once the effect caught up —
// on a phone, exactly the connection where that wasted round trip
// hurts most. typeof window guards the one place this still runs
// without a browser: next build's static-generation pass executes
// this component in Node to prerender "/" — see isLoaded's own
// server-snapshot gate just below, which already returns null in
// that same environment regardless, so this only ever affects a REAL
// client's first paint, never the prerendered HTML.
function usePortraitLayout() {
  const [isPortrait, setIsPortrait] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(PORTRAIT_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(PORTRAIT_QUERY);
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
  // Same lazy-initializer reasoning as usePortraitLayout above — this
  // is the one whose first-render value picks the video <src> itself.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_WIDTH_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_WIDTH_QUERY);
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
  const { setSpecialization } = useSpecialization();
  const { data: branches } = useBranches();
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
  // Branch, then — only for a branch with has_specializations=true
  // (CSE today) — Specialization, then Year. Department and Degree
  // are never asked here at all: exactly one of each exists, so
  // there's nothing for a student to choose.
  const [step, setStep] = useState<"branch" | "specialization" | "term">("branch");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
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
  // reads useBranchBySlug/useTermBySlug, both derived from
  // useBranches()/useTerms() (see those files) — so warming just
  // these two list queries here, while the person is watching the
  // intro type out, means every page's branch/term lookup resolves
  // from cache the moment they land, instead of paying for a fresh
  // fetch on the connection that matters most (a cold cache, right
  // after picking a branch).
  //
  // queryClient.prefetchQuery, not a raw supabase call + setQueryData
  // (what this used to be) — that version force-wrote its result into
  // the cache unconditionally, error or not. A transient failure (any
  // network hiccup) meant `data` came back null, and null ?? [] cached
  // an EMPTY branch list as if it had loaded successfully — silently
  // poisoning BranchSelectCard's own useBranches() into skipping its
  // loading/error states entirely (the cache already had "data") and
  // rendering a permanently blank list with no retry. prefetchQuery
  // shares the exact queryFn a real useQuery call would use, so it
  // dedupes against BranchSelectCard's own fetch instead of racing it,
  // and a failure here just leaves the query to actually error (or
  // retry) through the normal isLoading/isError path instead of
  // masquerading as a successful empty result.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["branches"],
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from("branches").select("*").order("sort_order");
        if (error) throw error;
        return data as Branch[];
      },
      staleTime: 5 * 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["terms"],
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from("academic_terms").select("*").order("sort_order");
        if (error) throw error;
        return data as AcademicTerm[];
      },
      staleTime: 5 * 60_000,
    });
    // TermSelectCard (the Cockpit's actual "select your year" step)
    // reads useCurrentTermsByYear, not useTerms() — a different query
    // key and a client-side reduction over batch_terms, not
    // academic_terms directly. Without prefetching THIS exact query
    // too, the Term step always paid for a fresh fetch no matter how
    // early the intro started warming the cache, since "terms" above
    // never dedupes against it. Mirrors useCurrentTermsByYear's own
    // queryFn exactly, same reasoning as this effect's other two
    // prefetches — sharing the identical key/fn is what lets this
    // dedupe against the card's own eventual useQuery call instead of
    // racing it.
    queryClient.prefetchQuery({
      queryKey: ["terms", "current-by-year"],
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("batch_terms")
          .select("start_date, term:academic_terms(*)")
          .order("start_date", { ascending: true });
        if (error) throw error;

        const todayKey = localDateKey(new Date().toISOString());
        const byYear = new Map<number, AcademicTerm>();
        for (const row of data ?? []) {
          const term = (Array.isArray(row.term) ? row.term[0] : row.term) as AcademicTerm | null;
          if (!term) continue;
          const alreadyStarted = isDateReached(row.start_date, todayKey);
          if (!byYear.has(term.year_number) || alreadyStarted) {
            byYear.set(term.year_number, term);
          }
        }
        return [...byYear.values()].sort((a, b) => a.year_number - b.year_number);
      },
      staleTime: 5 * 60_000,
    });
  }, [queryClient]);

  // Once the branch list itself resolves, warm the Specialization step
  // too — CSE is the only has_specializations branch today, but this
  // stays data-driven (every such branch, not a hardcoded CSE check)
  // so a second one added later gets the same treatment automatically.
  // Without this, picking a branch that has specializations always
  // showed a loading skeleton on the very next step no matter how long
  // someone lingered on the branch step first, since nothing had ever
  // asked for that branch's specializations yet.
  useEffect(() => {
    if (!branches) return;
    for (const branch of branches) {
      if (!branch.has_specializations) continue;
      queryClient.prefetchQuery({
        queryKey: ["specializations", branch.id],
        queryFn: async () => {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("specializations")
            .select("*")
            .eq("branch_id", branch.id)
            .order("sort_order");
          if (error) throw error;
          return data as Specialization[];
        },
        staleTime: 5 * 60_000,
      });
    }
  }, [branches, queryClient]);

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

  function enterSancturm() {
    setExiting(true);
    setTimeout(() => {
      router.push("/notes");
    }, EXIT_DURATION_S * 1000);
  }

  function handleBranchSelect(slug: string) {
    setBranch(slug);
    const branch = branches?.find((b) => b.slug === slug);
    if (branch?.has_specializations) {
      setSelectedBranchId(branch.id);
      setStep("specialization");
      return;
    }
    setSelectedBranchId(null);
    setStep("term");
  }

  function handleSpecializationSelect(slug: string) {
    setSpecialization(slug);
    setStep("term");
  }

  function handleTermSelect(slug: string) {
    setTerm(slug);
    enterSancturm();
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
          // Some mobile browsers default to metadata-only preloading
          // on cellular connections as a data-saving heuristic, even
          // with autoplay present — this is the first thing on the
          // page and the one thing everything else (the typed
          // headline, the year/branch cards) is waiting on, so it
          // shouldn't be left to that heuristic.
          preload="auto"
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
              {step === "branch" && <BranchSelectCard onSelect={handleBranchSelect} />}
              {step === "specialization" && selectedBranchId && (
                <>
                  <SpecializationSelectCard branchId={selectedBranchId} onSelect={handleSpecializationSelect} />
                  <button
                    type="button"
                    onClick={() => setStep("branch")}
                    className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
                  >
                    ← change branch
                  </button>
                </>
              )}
              {step === "term" && (
                <>
                  <TermSelectCard onSelect={handleTermSelect} />
                  <button
                    type="button"
                    onClick={() => setStep(selectedBranchId ? "specialization" : "branch")}
                    className="font-mono text-xs text-subtle-foreground transition-colors hover:text-foreground active:text-foreground"
                  >
                    {selectedBranchId ? "← change specialization" : "← change branch"}
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
