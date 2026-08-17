"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/auth/role";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { assertValidId, assertValidString, safeDbError, MAX_MESSAGE_LENGTH } from "@/lib/validation";

const MAX_UPI_ID_LENGTH = 100;
const MAX_QR_URL_LENGTH = 2000;
const MAX_SUGGESTED_AMOUNTS = 6;
const MAX_AMOUNT_RUPEES = 100_000;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_UTR_LENGTH = 40;

// A UPI handle is `name@bank` — no spaces, no protocol, nothing that
// could smuggle a URL or script into a field this app renders as
// plain text right next to a QR code.
const UPI_ID_RE = /^[a-zA-Z0-9.\-_]{2,60}@[a-zA-Z0-9.\-_]{2,40}$/;
const UTR_RE = /^[a-zA-Z0-9]{4,40}$/;

async function writeAuditLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: string,
  actor: string | null,
  detail: Record<string, unknown> = {}
) {
  // Best-effort — a failed audit insert should never take down the
  // real mutation it's describing. Never pass anything secret in
  // `detail`; this table is admin-readable, not secret-grade storage.
  const { error } = await supabase.from("support_audit_log").insert({ action, actor, detail });
  if (error) console.error("support_audit_log insert failed:", error);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const role = await getCurrentRole();
  if (role?.type !== "admin") throw new Error("Admin only.");
  return { supabase, user, role };
}

/**
 * Admin-only. Updates any subset of the public support config —
 * enabling/disabling is handled by setSupportEnabled below (its own
 * function, its own audit action name, since "support flipped on/off"
 * is the one change this feature's whole design revolves around
 * being able to point to later).
 */
export async function updateSupportConfig(input: {
  upiId?: string | null;
  qrUrl?: string | null;
  suggestedAmounts?: number[];
  supportMessage?: string;
  paymentInstructions?: string;
}) {
  const { supabase, user, role } = await requireAdmin();
  await checkRateLimit("updateSupportConfig", user.id, 20, 60_000);

  const patch: Record<string, unknown> = {
    updated_by: role.displayName,
    updated_at: new Date().toISOString(),
  };

  if (input.upiId !== undefined) {
    if (input.upiId !== null) {
      assertValidString(input.upiId, "UPI ID", { maxLength: MAX_UPI_ID_LENGTH });
      if (!UPI_ID_RE.test(input.upiId.trim())) throw new Error("Invalid UPI ID format.");
      patch.upi_id = input.upiId.trim();
    } else {
      patch.upi_id = null;
    }
  }

  if (input.qrUrl !== undefined) {
    if (input.qrUrl !== null) {
      assertValidString(input.qrUrl, "QR URL", { maxLength: MAX_QR_URL_LENGTH });
      let parsed: URL;
      try {
        parsed = new URL(input.qrUrl.trim());
      } catch {
        throw new Error("QR URL must be a valid URL.");
      }
      if (parsed.protocol !== "https:") throw new Error("QR URL must use https.");
      // The page's img-src CSP only allows R2 (this app's own file
      // storage) and Supabase (see next.config.ts) — an arbitrary
      // third-party image host would pass every check above and then
      // silently fail to render, which is worse than rejecting it
      // here with a clear reason. Upload the QR through the same R2
      // pipeline every other file in this app already uses, then
      // paste that URL here.
      const allowedOrigins = [process.env.R2_PUBLIC_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(
        (v): v is string => !!v
      );
      if (!allowedOrigins.some((origin) => input.qrUrl!.trim().startsWith(origin))) {
        throw new Error("QR URL must be hosted on Sancturm's own storage.");
      }
      patch.qr_url = input.qrUrl.trim();
    } else {
      patch.qr_url = null;
    }
  }

  if (input.suggestedAmounts !== undefined) {
    if (
      !Array.isArray(input.suggestedAmounts) ||
      input.suggestedAmounts.length === 0 ||
      input.suggestedAmounts.length > MAX_SUGGESTED_AMOUNTS ||
      !input.suggestedAmounts.every(
        (n) => Number.isInteger(n) && n > 0 && n <= MAX_AMOUNT_RUPEES
      )
    ) {
      throw new Error("Invalid suggested amounts.");
    }
    patch.suggested_amounts = input.suggestedAmounts;
  }

  if (input.supportMessage !== undefined) {
    assertValidString(input.supportMessage, "Support message", { maxLength: MAX_MESSAGE_LENGTH });
    patch.support_message = input.supportMessage.trim();
  }

  if (input.paymentInstructions !== undefined) {
    assertValidString(input.paymentInstructions, "Payment instructions", {
      maxLength: MAX_MESSAGE_LENGTH,
      required: false,
    });
    patch.payment_instructions = input.paymentInstructions.trim();
  }

  const { error } = await supabase.from("support_config").update(patch).eq("id", true);
  if (error) throw safeDbError(error);

  await writeAuditLog(supabase, "config_updated", role.displayName, {
    fields: Object.keys(patch).filter((k) => k !== "updated_by" && k !== "updated_at"),
  });
  revalidatePath("/support");
  revalidatePath("/cr/manage");
}

/** Admin-only. Its own action (not folded into updateSupportConfig) so enable/disable always gets its own audit entry, per this feature's whole point. */
export async function setSupportEnabled(enabled: boolean) {
  if (typeof enabled !== "boolean") throw new Error("Invalid value.");
  const { supabase, user, role } = await requireAdmin();
  await checkRateLimit("setSupportEnabled", user.id, 20, 60_000);

  const { error } = await supabase
    .from("support_config")
    .update({ enabled, updated_by: role.displayName, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw safeDbError(error);

  await writeAuditLog(supabase, enabled ? "support_enabled" : "support_disabled", role.displayName);
  revalidatePath("/support");
  revalidatePath("/cr/manage");
}

/**
 * Public — no sign-in required, since students have no auth account
 * anywhere in this app. This only ever creates a `pending` row; the
 * INSERT policy on `contributions` independently enforces that same
 * constraint at the database level (see add_support_sancturm.sql),
 * so this validation is defense-in-depth, not the actual boundary.
 *
 * Rate-limited by IP, not user id — there is no user id here.
 */
export async function createContribution(input: {
  amount: number;
  isAnonymous: boolean;
  displayName?: string | null;
  utr?: string | null;
}) {
  const supabase = await createClient();
  const ip = (await getClientIp()) ?? "unknown";
  await checkRateLimit("createContribution", ip, 5, 60_000);

  // Refuses to create a contribution for a feature the config says is
  // off, regardless of what a stale/tampered client believes — the
  // UI never shows this form while disabled, but this is the actual
  // enforcement point, not that.
  const { data: config, error: configError } = await supabase
    .from("support_config")
    .select("enabled")
    .single();
  if (configError) throw safeDbError(configError);
  if (!config?.enabled) throw new Error("Support isn't enabled right now.");

  if (
    typeof input.amount !== "number" ||
    !Number.isInteger(input.amount) ||
    input.amount <= 0 ||
    input.amount > MAX_AMOUNT_RUPEES
  ) {
    throw new Error("Invalid amount.");
  }
  if (typeof input.isAnonymous !== "boolean") throw new Error("Invalid request.");

  let displayName: string | null = null;
  if (!input.isAnonymous) {
    assertValidString(input.displayName ?? "", "Name", {
      maxLength: MAX_DISPLAY_NAME_LENGTH,
      required: false,
    });
    displayName = input.displayName?.trim() || null;
  }

  let utr: string | null = null;
  if (input.utr) {
    assertValidString(input.utr, "UTR", { maxLength: MAX_UTR_LENGTH });
    if (!UTR_RE.test(input.utr.trim())) throw new Error("Invalid UTR format.");
    utr = input.utr.trim();
  }

  // Generated here rather than read back via `.select()` after
  // insert — contributions has no public SELECT policy at all (see
  // add_support_sancturm.sql's own comment on why), and Postgres RLS
  // applies the SELECT policy to an INSERT...RETURNING just as much as
  // to a plain read. An anonymous insert-then-select would fail here
  // for the exact same reason an anonymous read of someone else's
  // contribution correctly fails — this sidesteps that by never
  // needing RETURNING at all.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("contributions").insert({
    id,
    amount: input.amount,
    is_anonymous: input.isAnonymous,
    display_name: displayName,
    utr,
  });
  if (error) throw safeDbError(error);

  return { id };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["successful", "failed", "cancelled"],
};

/**
 * Admin-only. The ONLY way a contribution's status can move (besides
 * a future verified webhook, which goes through the service-role
 * client in the webhook route, not this action). Refuses any
 * transition that doesn't start from `pending` — an admin re-clicking
 * an already-decided row, or a crafted request targeting an already-
 * `successful` row, both get rejected here rather than silently
 * re-applying.
 */
export async function verifyContribution(id: string, decision: "successful" | "failed") {
  if (decision !== "successful" && decision !== "failed") throw new Error("Invalid decision.");
  assertValidId(id, "Contribution id");

  const { supabase, user, role } = await requireAdmin();
  await checkRateLimit("verifyContribution", user.id, 60, 60_000);

  const { data: existing, error: fetchError } = await supabase
    .from("contributions")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw safeDbError(fetchError);
  if (!existing) throw new Error("Contribution not found.");
  if (!VALID_TRANSITIONS[existing.status]?.includes(decision)) {
    throw new Error(`Can't mark a ${existing.status} contribution as ${decision}.`);
  }

  const { error } = await supabase
    .from("contributions")
    .update({ status: decision, verified_at: new Date().toISOString(), verified_by: role.displayName })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw safeDbError(error);

  await writeAuditLog(supabase, "contribution_verified", role.displayName, { id, decision });
  revalidatePath("/cr/manage");
}
