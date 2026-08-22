"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { useBranch } from "@/hooks/useBranch";
import { useTerm } from "@/hooks/useTerm";
import { useSpecialization } from "@/hooks/useSpecialization";
import { useDeviceTier } from "@/hooks/useDeviceTier";
import { useBranches } from "@/features/branches/queries";
import { BranchSelectCard } from "@/features/branches/components/BranchSelectCard";
import { SpecializationSelectCard } from "@/features/branches/components/SpecializationSelectCard";
import { TermSelectCard } from "@/features/terms/components/TermSelectCard";
import { createClient } from "@/lib/supabase/client";
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

// Only an actual phone gets the dedicated mobile video asset — a
// tablet gets the wide tablet/desktop image instead (both always
// object-cover — see the background media's own comment). Tier
// resolution itself lives in useDeviceTier (shared with Maintenance/
// offline).

export function IntroExperience() {
  const router = useRouter();
  const { setBranch, isLoaded: branchLoaded } = useBranch();
  const { setTerm, isLoaded: termLoaded } = useTerm();
  const { setSpecialization } = useSpecialization();
  const { data: branches } = useBranches();
  const isLoaded = branchLoaded && termLoaded;
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();
  const deviceTier = useDeviceTier();
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

  // The video (mobile only — tablet/desktop render a static image, see
  // the background media JSX below) is always muted, so autoplay never
  // needs a user gesture or permission prompt — no gate button, no
  // volume fade, no audio at all. This call is just a defensive nudge
  // for browsers that don't reliably honor the autoPlay attribute on
  // mount.
  useEffect(() => {
    if (deviceTier !== "mobile") return;
    videoRef.current?.play().catch(() => {});
  }, [deviceTier]);

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
    // reads useCurrentTermsByYear, which is itself now derived from
    // useAllBatchTerms() (see terms/queries.ts's own comment) rather
    // than its own fetch — so prefetching THAT query's key/shape here
    // is what actually warms the Term step's cache, and it's also
    // exactly what useBatchSemesterFilter needs the moment onboarding
    // finishes and lands on Notes/PYQs, so this one prefetch now covers
    // both instead of only the switcher's own narrower reduced view.
    queryClient.prefetchQuery({
      queryKey: ["batch-terms", "all"],
      queryFn: async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("batch_terms")
          .select("*, term:academic_terms(*)")
          .order("start_date");
        if (error) throw error;
        return data;
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

  // Cockpit is a fixed, full-bleed media experience — it should never
  // zoom, on any input method, on any device. The mobile-viewport meta
  // tag (see the onboarding page's own `viewport` export) already
  // blocks pinch/double-tap zoom on iOS/Android by itself — that's a
  // route-scoped Next.js export, so it can't reach here to also cover
  // desktop, and desktop browsers don't expose an equivalent "disable
  // zoom" viewport flag at all. Desktop zoom instead arrives as two
  // separate input events neither of which the meta tag touches:
  // trackpad pinch / Ctrl+wheel (both fire as a `wheel` event with
  // ctrlKey set — this is a synthetic flag the browser itself sets for
  // zoom gestures, wheel's own ctrlKey is otherwise never true from a
  // real Ctrl+scroll) and Safari's own trackpad-pinch-specific
  // `gesturestart`/`gesturechange` events (Safari never routes trackpad
  // pinch through `wheel` at all). Listeners are attached only while
  // this component is mounted (cleaned up on unmount, e.g. once
  // enterSancturm() navigates away to /notes) so no other page is
  // touched. Browser-native zoom keyboard shortcuts (Ctrl/Cmd +/-) are
  // intentionally not interceptable by any page — no legitimate way
  // exists to block those, so they're left alone everywhere, Cockpit
  // included.
  useEffect(() => {
    function blockCtrlWheelZoom(event: WheelEvent) {
      if (event.ctrlKey) event.preventDefault();
    }
    function blockGestureZoom(event: Event) {
      event.preventDefault();
    }
    document.addEventListener("wheel", blockCtrlWheelZoom, { passive: false });
    document.addEventListener("gesturestart", blockGestureZoom);
    document.addEventListener("gesturechange", blockGestureZoom);
    return () => {
      document.removeEventListener("wheel", blockCtrlWheelZoom);
      document.removeEventListener("gesturestart", blockGestureZoom);
      document.removeEventListener("gesturechange", blockGestureZoom);
    };
  }, []);

  // The right-edge strip some users still saw (real background color
  // showing past the media's right edge — reported after the w-screen/
  // h-dvh fixes already landed) traces back to `scrollbar-gutter:
  // stable` on <html> (globals.css — reserved everywhere else in the
  // app to stop the scrollbar popping in and shifting content once a
  // resource list loads). That reservation carves out real gutter
  // space on the right edge of <html>'s own box even when nothing is
  // scrolling; `100vw`/w-screen is SUPPOSED to still span that gutter,
  // but exactly how much of it different Chromium/WebKit versions and
  // OS display-scaling factors (125%/150% Windows scaling especially)
  // fold into `100vw` isn't fully consistent — which is exactly the
  // kind of unit-based inaccuracy the height fix (dropping h-dvh for
  // plain inset-0) sidestepped entirely by not depending on a unit's
  // value at all. This is that same fix, mirrored onto the width axis:
  // rather than trying to size across a reserved gutter with a vw
  // unit, remove the gutter reservation outright for as long as
  // Cockpit is on screen, so inset-0's own left:0 + right:0 (see both
  // wrapper divs' own comments) is flush against the TRUE window edge
  // with no gutter and no unit math involved anywhere. Scoped to this
  // component's mount lifetime and reverted on unmount (e.g. once
  // enterSancturm() navigates to /notes), so every other page keeps
  // its own scrollbar-gutter reservation exactly as before.
  //
  // overflow: hidden on <html> alongside it — still reported afterward,
  // on Windows specifically, at a constant width regardless of window
  // size. A reserved *gutter* scales/behaves like normal layout, but a
  // REAL classic (non-overlay) Windows scrollbar is a fixed OS-defined
  // width (~17px) no matter the window size, and — critically — native
  // scrollbar chrome paints in the browser's own UI layer, on top of
  // everything the page renders, immune to any z-index/width/position
  // fix from CSS or JS alone. If <html> genuinely has ANY scrollable
  // overflow (its exact source doesn't matter — content a pixel taller
  // than the viewport, a browser extension injecting something, font-
  // load reflow), Windows shows that real scrollbar and no amount of
  // sizing the background media more precisely can ever paint over it.
  // The only fix that actually reaches that case is removing the
  // overflow itself so no scrollbar — gutter-reserved or real — has
  // any reason to exist while Cockpit, a fixed non-scrolling view, is
  // what's on screen.
  //
  // useLayoutEffect, not useEffect — this has to be in force before
  // the very first paint of the media below, not just "soon after
  // mount". useEffect fires after the browser has already painted the
  // initial commit, which would let that first frame render with the
  // gutter/scrollbar still present (the exact gap this is meant to
  // prevent). useLayoutEffect runs synchronously right after DOM
  // mutation but before paint, so by the time anything is actually
  // shown on screen the override is already active.
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previousGutter = html.style.scrollbarGutter;
    const previousOverflow = html.style.overflow;
    html.style.scrollbarGutter = "auto";
    html.style.overflow = "hidden";
    return () => {
      html.style.scrollbarGutter = previousGutter;
      html.style.overflow = previousOverflow;
    };
  }, []);

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
      // bg-black, not bg-background — the theme token is a warm cream/
      // brown in every palette (see globals.css), which read as a
      // colored flash behind the media for the split second before the
      // video/image has actually painted a frame. Black is neutral
      // against art of any hue and reads as "not loaded yet" rather
      // than as a colored placeholder.
      //
      // Neither dimension is set with an explicit vw/vh unit here —
      // inset-0 (top:0 + right:0 + bottom:0 + left:0) sizes a `fixed`
      // element against the real, current viewport directly, with no
      // unit involved at all, so it's exact on every reflow. Explicit
      // sizing units were tried on both axes and both went wrong in
      // their own way: h-screen/h-dvh over-constrained the box (an
      // explicit height makes the browser drop the bottom:0 constraint
      // in favor of top:0 + height, so any lag/inaccuracy in that vh
      // value showed up as a real gap against the bottom edge); w-screen
      // was added to cover a real gap on the right edge from <html>'s
      // site-wide `scrollbar-gutter: stable` (globals.css) — needed
      // elsewhere in the app, but 100vw's own handling of that reserved
      // gutter isn't fully consistent across browsers/OS display-scaling
      // factors, so w-screen itself still occasionally left a gap there.
      // Both are now solved the same way: the gutter reservation is
      // switched off for as long as Cockpit is mounted (see the
      // useLayoutEffect above), so there's no gutter for any unit to
      // get wrong — inset-0 alone is flush against the true window edge
      // on every side, unconditionally.
      //
      // touch-none (touch-action: none) — belt-and-suspenders with the
      // onboarding page's own viewport export (which already sets
      // user-scalable=no/maximum-scale=1 for this route): that meta
      // tag blocks pinch/double-tap zoom at the browser level, this
      // CSS property blocks the same gestures at the element level, so
      // pinch/double-tap zoom stays off here even on a browser that
      // only honors one of the two mechanisms. It doesn't disable taps
      // — the branch/term cards below stay fully clickable — only the
      // browser's own default pan/zoom gesture handling, which this
      // fixed, non-scrolling view never needed anyway.
      className="fixed inset-0 touch-none overflow-hidden bg-black"
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: EXIT_DURATION_S }}
    >
      {/* Always full-bleed, edge-to-edge — no letterboxed "contain" box.
          A fixed-aspect box centered in a viewport whose OWN aspect
          ratio differs from the media's (any width that isn't exactly
          16:9, which is most real windows) left visible gaps on the
          sides or top/bottom, exposing the plain page background
          around it. object-cover below crops to fill instead — it
          never distorts the media (aspect ratio is always preserved,
          only overflow is cropped), it just means the frame reaches
          every edge on every viewport instead of floating in a
          smaller box. overflow-hidden here (on top of the same
          property already on the outer `fixed` wrapper) is what clips
          the media's own deliberate 1px overscan below back down to
          this box's exact edges — see the media element's own comment
          for why it intentionally overshoots slightly. */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Background media — decorative only, not meaningful content,
            so it's hidden from screen readers and never keyboard-
            focusable. Mobile gets a dedicated video (autoplaying,
            muted, looping); tablet and desktop get a static image
            instead — a still frame reads as intentional at those
            sizes and costs nothing after the one download, where a
            looping video would just be ambient weight with no payoff
            (nobody's staring at Cockpit long enough to notice a loop
            seam at tablet/desktop width the way a phone-in-hand moment
            might). Always object-cover, never object-contain — see
            this wrapper's own comment for why.

            inset-0 + h-full + w-full, all three — unlike a plain
            non-replaced box, an absolutely-positioned REPLACED element
            (img/video) with width/height left `auto` does NOT stretch
            to fill its inset offsets; per spec it instead sizes to its
            own intrinsic pixel dimensions, with only ONE side's inset
            actually honored. (Tried removing h-full/w-full here,
            reasoning by analogy from the OUTER wrapper's own h-screen/
            w-screen fix further up this file — that was wrong: this
            element is a replaced element, and the "let inset alone
            define the box" trick that fixed the wrapper's over-
            constraint only applies to non-replaced boxes. Verified
            live: without an explicit height/width, this rendered at
            its native asset resolution, anchored only top-left,
            leaving the rest of the viewport exposed — an actual
            regression, not the fix. Explicit h-full/w-full is what
            gives object-cover a real box to scale/crop against in the
            first place; it's required here, not redundant.) The 1%
            scale below is the real fix for any residual sub-pixel gap:
            a pure post-layout visual transform, so it can't reopen the
            over-constraint problem the way an inset trick did — it
            just blows the already-correctly-sized image up 1% past
            every edge as a safety margin, and the parent's own
            overflow-hidden two levels up (plus this element's own)
            clips that 1% straight back off, invisibly. */}
        {deviceTier === "mobile" ? (
          <video
            ref={videoRef}
            src="/media/cockpit-mobile.mp4"
            className="absolute inset-0 h-full w-full scale-[1.01] object-cover"
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
        ) : (
          // Tablet and desktop share the exact same full-bleed
          // object-cover treatment now — only the source image
          // differs. (A previous version sized the desktop image by
          // width instead, to avoid ever cropping the composition —
          // reverted per explicit request: fill 100vw x 100vh with no
          // black bars is the priority now, cropping is accepted.
          // object-cover never distorts — aspect ratio is always
          // preserved, only overflow is cropped.) Which of the two
          // this device gets is decided by useDeviceTier's touch-vs-
          // pointer check, not a width breakpoint — see that hook's
          // own comment for why a width check alone misclassifies a
          // tablet like iPad Pro (1024-1366px wide) as desktop.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={deviceTier === "tablet" ? "/media/cockpit-tablet.webp" : "/media/cockpit-desktop.webp"}
            alt=""
            aria-hidden="true"
            // inset-0 + h-full + w-full + scale-[1.01] — see the video
            // element's own comment above for the full reasoning.
            className="absolute inset-0 h-full w-full scale-[1.01] object-cover"
            onLoad={() => setVideoReady(true)}
          />
        )}
        {/* Anchored higher than the frame's own open-sky area's exact
            center so it clears the seated figure/desk lower in frame —
            moved up from the previous 19%/22% anchor, which read as
            too low against the intended empty space. Mobile/tablet
            pushed up further still (3%/5%, was 6%/8%) — on a narrow
            viewport the card's own height eats a bigger share of the
            frame, and even a modest anchor was low enough for the
            card's bottom edge to reach the seated figure lower in the
            art. Desktop (lg+, 1024px+ — the same width step
            SelectCard's own card sizing already treats as "desktop")
            nudged up again, 11% -> 8%, alongside that card shrinking a
            touch (see SelectCard's own comment) — a smaller card at
            the old 11% anchor left more open sky above it than
            intended; moving both up together keeps the headline +
            card group reading as one balanced unit instead of just
            floating lower against a now-smaller card. */}
        <div className="absolute inset-x-0 top-[6%] flex flex-col items-center gap-2 px-6 text-center sm:top-[8%] sm:gap-4 lg:top-[8%] lg:gap-6">
          {videoReady && (
            <h1
              // No overlay on the media itself (see the background art's
              // own comment — a wash over the whole frame was exactly
              // what made it look faded in a screenshot review). Text
              // legibility now comes entirely from the text's own
              // rendering: a tight dark stack (readable against a light
              // sky) plus the original glow underneath, not anything
              // layered over the video/image.
              className="whitespace-nowrap font-mono text-[24px] font-medium tracking-[0.02em] text-white sm:text-[30px] sm:tracking-[0.08em] md:text-[40px] lg:text-[56px]"
              style={{
                textShadow:
                  "0 1px 3px rgba(0,0,0,.85), 0 0 1px rgba(0,0,0,.9), 0 0 20px rgba(77,168,255,.25)",
              }}
            >
              {typedText}
              <span className={cursorClassName(typingDone, cursorVisible)} aria-hidden="true">
                |
              </span>
            </h1>
          )}

          {showSelector && (
            // y-only reveal, no opacity fade — a backdrop-blurred glass
            // card fading in from opacity:0 visibly ramps its OWN blur
            // strength as it goes (a 10%-opaque blurred backdrop reads
            // as barely frosted, 100% reads as fully frosted), which is
            // exactly the "two-phase" jump this was built to avoid. The
            // card is at its one, final glass style from the very first
            // frame it's in the DOM; only its position animates.
            <motion.div
              key={step}
              initial={{ y: 12 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 flex flex-col items-center gap-3"
            >
              {step === "branch" && <BranchSelectCard onSelect={handleBranchSelect} />}
              {step === "specialization" && selectedBranchId && (
                <>
                  <SpecializationSelectCard branchId={selectedBranchId} onSelect={handleSpecializationSelect} />
                  <button
                    type="button"
                    onClick={() => setStep("branch")}
                    className="font-mono text-xs text-white/70 transition-colors hover:text-white active:text-white"
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
                    className="font-mono text-xs text-white/70 transition-colors hover:text-white active:text-white"
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
