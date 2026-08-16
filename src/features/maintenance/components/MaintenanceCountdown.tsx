"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Wrench, Lock } from "lucide-react";
import { useMaintenanceConfig } from "@/features/maintenance/queries";

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

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden bg-background px-6 text-center">
      {/* Ambient glow — the same --glow-red/--glow-blue tokens every
          other deliberate accent in this app draws from (see
          globals.css), just larger and softer here since this page has
          nothing else competing with it. Two off-center blobs instead
          of one centered one reads as considered lighting rather than
          a flat spotlight. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[12%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[var(--glow-red)] blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[8%] right-[12%] h-[420px] w-[420px] rounded-full bg-[var(--glow-blue)] blur-[130px]"
      />

      <div className="relative flex flex-col items-center gap-10">
        <motion.span
          {...reveal(0)}
          className="font-mono text-sm font-medium tracking-[0.1em] text-terminal-blue"
        >
          sancturm
        </motion.span>

        <motion.div {...reveal(0.08)} className="flex flex-col items-center gap-4">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
            {!prefersReducedMotion && (
              <span
                aria-hidden="true"
                className="absolute inset-0 animate-ping rounded-full bg-primary/15 [animation-duration:2.4s]"
              />
            )}
            <Wrench className="h-5 w-5 text-primary" strokeWidth={1.75} />
          </div>

          <div className="flex flex-col items-center gap-3">
            <h1 className="text-balance font-mono text-[32px] font-medium tracking-[0.05em] text-foreground md:text-[44px]">
              Under maintenance
            </h1>
            <p className="max-w-sm text-balance text-base text-muted-foreground md:text-lg">
              {effectiveMessage || "Sancturm is briefly offline for maintenance. Back shortly."}
            </p>
          </div>
        </motion.div>

        <motion.div
          {...reveal(0.16)}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-10 py-6 shadow-[0_0_50px_-16px_var(--glow-red)]"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle-foreground">
            Back online in
          </span>
          <span className="font-mono text-4xl font-medium tabular-nums text-primary md:text-5xl">
            {formatRemaining(remaining)}
          </span>
        </motion.div>

        <motion.div {...reveal(0.24)} className="flex flex-col items-center gap-4">
          <p className="font-mono text-xs text-subtle-foreground">This page updates automatically.</p>
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
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 font-mono text-xs font-medium text-foreground transition-all duration-200 hover:border-primary/50 hover:shadow-[0_0_28px_-10px_var(--glow-red)] active:scale-[0.97]"
          >
            <Lock
              className="h-3.5 w-3.5 text-subtle-foreground transition-colors duration-200 group-hover:text-primary"
              strokeWidth={2}
            />
            Admin sign in
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
