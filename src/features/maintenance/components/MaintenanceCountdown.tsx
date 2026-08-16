"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <h1 className="font-mono text-[34px] font-medium tracking-[0.08em] text-foreground md:text-[42px]">
        Under maintenance
      </h1>
      <p className="text-lg text-muted-foreground">
        {effectiveMessage || "Sancturm is briefly offline for maintenance. Back shortly."}
      </p>
      <p className="font-mono text-3xl text-primary">{formatRemaining(remaining)}</p>
      <p className="font-mono text-xs text-subtle-foreground">This page updates automatically.</p>
      {/* /login is deliberately excluded from middleware's maintenance
          redirect (see middleware.ts's own matcher comment) so an admin
          can always sign back in and end/extend the window — but that
          only actually works if there's a way to REACH it from here.
          Without this link, a signed-out admin landing on this exact
          page (a bookmark, a fresh browser) had no visible path to
          /login short of typing it into the address bar by hand. */}
      <Link
        href="/login"
        className="mt-2 font-mono text-xs text-subtle-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline active:text-foreground active:underline"
      >
        Admin sign in
      </Link>
    </main>
  );
}
