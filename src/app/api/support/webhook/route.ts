import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Dormant scaffolding for a future payment provider's webhook — no
 * provider is configured to call this yet (SUPPORT_WEBHOOK_SECRET is
 * unset in this deployment), so every real request here today 401s
 * (bad/missing signature) before createAdminClient() is ever reached.
 * That's the correct failure mode for infrastructure nothing points at
 * yet — fail closed, never silently accept an unverified "payment
 * succeeded" claim.
 *
 * Header name and HMAC-over-raw-body scheme match Razorpay's actual
 * webhook convention (a real possibility for this project later) —
 * swapping providers before activation may only need the header name
 * and event-shape parsing below changed, not this file's structure.
 *
 * NEVER trust a "successful" status carried in the request body
 * alone — signature verification is what makes this call trustworthy
 * at all; a request that fails verification is treated identically to
 * one from a random script, regardless of what it claims.
 */

const SIGNATURE_HEADER = "x-webhook-signature";
const MAX_BODY_BYTES = 64 * 1024;

type WebhookEvent = {
  event_id: string;
  provider: string;
  contribution_id: string;
  status: "successful" | "failed";
  provider_reference_id?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidEvent(value: unknown): value is WebhookEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.event_id === "string" &&
    v.event_id.length > 0 &&
    v.event_id.length <= 200 &&
    typeof v.provider === "string" &&
    v.provider.length > 0 &&
    v.provider.length <= 50 &&
    typeof v.contribution_id === "string" &&
    UUID_RE.test(v.contribution_id) &&
    (v.status === "successful" || v.status === "failed") &&
    (v.provider_reference_id === undefined ||
      (typeof v.provider_reference_id === "string" && v.provider_reference_id.length <= 200))
  );
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  // timingSafeEqual throws on mismatched length instead of returning
  // false — length differing is itself not a secret worth leaking
  // timing on, so this short-circuits safely before the real compare.
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: NextRequest) {
  // IP-only limiter — this endpoint has no user/session concept at
  // all, verified or not.
  const ip = (await getClientIp()) ?? "unknown";
  try {
    await checkRateLimit("supportWebhook", ip, 30, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const secret = process.env.SUPPORT_WEBHOOK_SECRET;
  if (!secret) {
    // Deliberately generic — never confirms or denies configuration
    // state to an unauthenticated caller beyond "this isn't usable".
    console.error("support webhook received but SUPPORT_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Not available." }, { status: 503 });
  }

  if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  if (!isValidEvent(parsed)) {
    return NextResponse.json({ error: "Invalid event shape." }, { status: 400 });
  }
  const event = parsed;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("support webhook: admin client unavailable:", err);
    return NextResponse.json({ error: "Not available." }, { status: 503 });
  }

  // Idempotency: the unique (provider, event_id) index does the real
  // work — a duplicate delivery of the same event hits this insert's
  // unique-violation and is treated as an already-handled no-op
  // rather than reprocessed, satisfying "duplicate webhooks are
  // idempotent" without a separate read-then-write race window.
  const { error: eventInsertError } = await admin
    .from("payment_webhook_events")
    .insert({ provider: event.provider, event_id: event.event_id });
  if (eventInsertError) {
    if (eventInsertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("support webhook: event log insert failed:", eventInsertError.code);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  // Only a `pending` row can ever be finalized here — mirrors
  // verifyContribution's exact same invariant, so neither path can
  // ever flip an already-decided contribution.
  const { data: updated, error: updateError } = await admin
    .from("contributions")
    .update({
      status: event.status,
      provider: event.provider,
      provider_reference_id: event.provider_reference_id ?? null,
      verified_at: new Date().toISOString(),
      verified_by: "webhook",
    })
    .eq("id", event.contribution_id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError) {
    console.error("support webhook: contribution update failed:", updateError.code);
    return NextResponse.json({ error: "Internal error." }, { status: 500 });
  }

  await admin.from("support_audit_log").insert({
    action: "webhook_received",
    actor: `webhook:${event.provider}`,
    detail: { event_id: event.event_id, contribution_id: event.contribution_id, status: event.status, applied: !!updated },
  });

  await admin
    .from("payment_webhook_events")
    .update({ processed: true, contribution_id: updated ? event.contribution_id : null })
    .eq("provider", event.provider)
    .eq("event_id", event.event_id);

  return NextResponse.json({ ok: true, applied: !!updated });
}
