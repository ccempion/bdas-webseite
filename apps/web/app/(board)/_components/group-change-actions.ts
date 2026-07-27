"use server";

import { getDb } from "@bdas/db";
import { decideGroupChange, getGroupChangeHistory, type GroupChangeRequest } from "@bdas/members";

import { actor, safeRevalidate } from "./board-actor";

/** Approve or reject a transfer. Authority is enforced inside decideGroupChange. */
export async function decideGroupChangeAction(
  requestId: string,
  decision: "approved" | "rejected",
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await decideGroupChange(getDb(), requestId, decision, await actor());
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    // Revalidate on failure too: a decision usually fails because the request is
    // already gone (withdrawn, or decided in another tab). Leaving the stale row
    // on screen offers a button that can never work.
    safeRevalidate(revalidate);
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** One member's movement history — loaded lazily when a board opens their card. */
export async function groupHistoryAction(
  memberId: string,
): Promise<{ ok: boolean; error?: string; entries?: GroupChangeRequest[] }> {
  try {
    const entries = await getGroupChangeHistory(getDb(), memberId, await actor());
    return { ok: true, entries };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
