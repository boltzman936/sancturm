"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Wrench, Lock } from "lucide-react";
import { useMaintenanceConfig } from "@/features/maintenance/queries";
import { Logo } from "@/components/layout/Logo";
import { useDeviceTier } from "@/hooks/useDeviceTier";

// India-fixed, not the visitor's own timezone — Sancturm's whole
// audience is one campus, so "back online at 6:30 PM" should always
// mean IST regardless of which timezone a visitor's device happens to
// be set to (a laptop with the wrong system clock/region is common
// enough that trusting it here would just be confusing).
function formatIstTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function computeClockOffset(serverNow: string) {
  return Date.parse(serverNow) - Date.now();
}

function computeRemaining(until: string, clockOffset: number) {
  return Date.parse(until) - (Date.now() + clockOffset);
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Displays a countdown to `until` without trusting the visitor's own
 * clock: a fixed offset between the server's clock (captured once,
 * server-side, at page render) and this browser's clock is computed
 * once on mount, and every tick is drawn against `Date.now() + offset`
 * instead of the raw browser time. This is cosmetic UX only — the
 * actual access gate is middleware's own server-side check on every
 * navigation, so a wrong/tampered browser clock here can't grant
 * early access, only mis-display a number.
 *
 * Polls maintenance_config (useMaintenanceConfig, 15s interval) so an
 * admin extending or ending maintenance from another tab is picked up
 * live instead of only once the countdown reaches zero.
 */
export function MaintenanceCountdown({
  until,
  message,
  serverNow,
}: {
  until: string;
  message: string | null;
  serverNow: string;
}) {
  const router = useRouter();
  const { data: config } = useMaintenanceConfig();
  const prefersReducedMotion = useReducedMotion();
  const clockOffset = useMemo(() => computeClockOffset(serverNow), [serverNow]);

  // The polled row wins once it's loaded — an admin's extend/end
  // takes effect here without waiting for the countdown to hit zero.
  const effectiveUntil = config?.until ?? until;
  const effectiveMessage = config?.message ?? message;

  const [remaining, setRemaining] = useState(() => computeRemaining(effectiveUntil, clockOffset));

  useEffect(() => {
    const tick = () => setRemaining(computeRemaining(effectiveUntil, clockOffset));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [effectiveUntil, clockOffset]);

  useEffect(() => {
    if (remaining <= 0) router.refresh();
  }, [remaining, router]);

  // Staggered reveal (logo -> headline -> countdown -> footer), same
  // "type it out, then let the next piece settle in" pacing the
  // onboarding Cockpit intro already uses — this page is the other
  // moment a visitor spends real time looking at plain text with
  // nothing else to do, so it earns the same care. Reduced motion
  // collapses every step to its final, static state immediately.
  const reveal = (delay: number) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  const deviceTier = useDeviceTier();
  const backgroundSrc =
    deviceTier === "mobile"
      ? "/media/maintenance-mobile.webp"
      : deviceTier === "tablet"
        ? "/media/maintenance-tablet.webp"
        : "/media/maintenance-desktop.webp";

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed
          background art per responsive tier, not a content image. */}
      <img src={backgroundSrc} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-background/55" />

      {/* Ambient glow — the same --glow-red/--glow-blue tokens every
          other deliberate accent in this app draws from (see
          globals.css), just larger and softer here since this page has
          nothing else competing with it. Two off-center blobs instead
          of one centered one reads as considered lighting rather than
          a flat spotlight. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[12%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[var(--glow-red)] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[8%] right-[12%] h-[340px] w-[340px] rounded-full bg-[var(--glow-blue)] blur-[130px]"
      />

      {/* Content sized down proportionally from the original (see item
          22 of the redesign brief) — every piece scaled together
          rather than the page wrapped in one blanket zoom, so relative
          proportions (icon vs headline vs countdown) stay exactly what
          they were, just smaller and lighter over the new artwork. */}
      <div className="relative flex flex-col items-center gap-7">
        <motion.div {...reveal(0)}>
          <Logo className="text-2xl" />
        </motion.div>

        <motion.div {...reveal(0.08)} className="flex flex-col items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">
            {!prefersReducedMotion && (
              <span
                aria-hidden="true"
                className="absolute inset-0 animate-ping rounded-full bg-primary/15 [animation-duration:2.4s]"
              />
            )}
            <Wrench className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <h1 className="text-balance font-mono text-[24px] font-medium tracking-[0.05em] text-foreground md:text-[32px]">
              Under maintenance
            </h1>
            <p className="max-w-xs text-balance text-sm text-muted-foreground md:text-base">
              {effectiveMessage || "Sancturm is briefly offline for maintenance. Back shortly."}
            </p>
          </div>
        </motion.div>

        <motion.div
          {...reveal(0.16)}
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-8 py-4 shadow-[0_0_50px_-16px_var(--glow-red)]"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle-foreground">
            Back online in
          </span>
          <span className="font-mono text-3xl font-medium tabular-nums text-primary md:text-4xl">
            {formatRemaining(remaining)}
          </span>
          {/* IST, always — Sancturm's whole audience is one campus, so
              this shouldn't read differently on a visitor's device set
              to a different timezone (see formatIstTime's own comment). */}
          <span className="font-mono text-[11px] text-subtle-foreground">
            around {formatIstTime(effectiveUntil)} IST
          </span>
        </motion.div>

        <motion.div {...reveal(0.24)} className="flex flex-col items-center gap-3">
          <p className="font-mono text-[11px] text-subtle-foreground">This page updates automatically.</p>
          {/* /login is deliberately excluded from middleware's
              maintenance redirect (see middleware.ts's own matcher
              comment) so an admin can always sign back in and end/
              extend the window — but that only actually works if
              there's a way to REACH it from here. Without this link, a
              signed-out admin landing on this exact page (a bookmark,
              a fresh browser) had no visible path to /login short of
              typing it into the address bar by hand. A real button
              here (not just a text link) matches the weight this
              action actually has — it's the one interactive thing on
              an otherwise read-only page, and the one path back to
              full control. */}
          <Link
            href="/login"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 font-mono text-[11px] font-medium text-foreground transition-all duration-200 hover:border-primary/50 hover:shadow-[0_0_28px_-10px_var(--glow-red)] active:scale-[0.97]"
          >
            <Lock
              className="h-3 w-3 text-subtle-foreground transition-colors duration-200 group-hover:text-primary"
              strokeWidth={2}
            />
            Admin sign in
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
