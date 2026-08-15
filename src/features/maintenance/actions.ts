"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Takes the whole site offline for everyone but the admin, for
 * `durationMinutes` starting now. `until` is always overwritten with
 * a fresh future value — there's no separate "active" flag to keep in
 * sync, and calling this again while already offline just resets the
 * window (use extendMaintenance to add time to the CURRENT window
 * instead, which guards against a race with expiry).
 */
export async function takeOffline(message: string, durationMinutes: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  checkRateLimit("takeOffline", user.id, 10, 60_000);

  if (durationMinutes <= 0) throw new Error("Duration must be positive.");

  const until = new Date(Date.now() + durationMinutes * 60_000).toISOString();
  const { error } = await supabase
    .from("maintenance_config")
    .update({
      until,
      message: message.trim() || null,
      updated_by: role.displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw error;

  revalidatePath("/maintenance");
  revalidatePath("/cr/manage");
}

/**
 * Adds time to the CURRENT maintenance window — extends from
 * max(currentUntil, now) rather than always from now, so extending
 * right as the window is about to (or just did) expire still lands on
 * a sensible future time instead of silently no-opping or shortening
 * it.
 */
export async function extendMaintenance(additionalMinutes: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  checkRateLimit("extendMaintenance", user.id, 10, 60_000);

  if (additionalMinutes <= 0) throw new Error("Duration must be positive.");

  const { data: current, error: readError } = await supabase
    .from("maintenance_config")
    .select("until")
    .eq("id", true)
    .single();
  if (readError) throw readError;

  const currentUntil = current.until ? new Date(current.until).getTime() : 0;
  if (currentUntil <= Date.now()) throw new Error("Not currently in maintenance.");

  const base = Math.max(currentUntil, Date.now());
  const until = new Date(base + additionalMinutes * 60_000).toISOString();
  const { error } = await supabase
    .from("maintenance_config")
    .update({ until, updated_by: role.displayName, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;

  revalidatePath("/maintenance");
  revalidatePath("/cr/manage");
}

/** Ends maintenance immediately, regardless of how much time was left. */
export async function bringOnline() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  checkRateLimit("bringOnline", user.id, 10, 60_000);

  const { error } = await supabase
    .from("maintenance_config")
    .update({ until: null, updated_by: role.displayName, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw error;

  revalidatePath("/maintenance");
  revalidatePath("/cr/manage");
}
