"use server";

import { getDb } from "@bdas/db";
import { decideGroupChange, type RejectionReason } from "@bdas/members";

import { actor, safeRevalidate } from "./board-actor";

/** Accept an application. Authority is enforced inside decideGroupChange. */
export async function acceptApplicationAction(
  requestId: string,
  slug: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, "approved", await actor());
    safeRevalidate(`/gruppe/${slug}/bewerbungen`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** Reject an application. The reason is required and validated in the service. */
export async function rejectApplicationAction(
  requestId: string,
  slug: string,
  reason: RejectionReason,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, "rejected", await actor(), reason);
    safeRevalidate(`/gruppe/${slug}/bewerbungen`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
