import "server-only";
import { createClient } from "@/lib/supabase/server";
import { localDateKey } from "@/lib/date";
import { isDateReached } from "./academicChronology";

/**
 * The server-side half of "never publish into, or move a published
 * item into, a semester that hasn't started" — every client-side
 * dropdown (Upload's, Edit's) already filters these out, but that's
 * just UX; this is what actually stops a request that targets one
 * anyway (a manipulated request, a stale form left open across a
 * batch_terms edit, or — for Edit specifically — the Batch <select>
 * there not itself being date-filtered, since Edit lets an admin
 * retarget ANY branch/term/batch, not just ones the resource already
 * belonged to).
 *
 * Reuses the exact same isDateReached comparison every date-filtered
 * dropdown already uses (see academicChronology.ts), so client and
 * server can't silently drift apart — this is the one place that
 * check is applied server-side, called from every resource/notice
 * action that writes a (batchId, termId) pair, whether creating or
 * editing one.
 */
export async function assertBatchTermReached(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
  termId: string
) {
  const { data, error } = await supabase
    .from("batch_terms")
    .select("start_date")
    .eq("batch_id", batchId)
    .eq("term_id", termId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isDateReached(data.start_date, localDateKey(new Date().toISOString()))) {
    throw new Error("That semester hasn't started yet for that batch, so it can't be used here.");
  }
}
