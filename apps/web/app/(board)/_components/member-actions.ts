"use server";

import { getDb } from "@bdas/db";
import { approveMember, transitionStatus } from "@bdas/members";

import { actor, safeRevalidate } from "./board-actor";

/** Approve a pending member. Authority is enforced inside approveMember. */
export async function approveMemberAction(
  memberId: string,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await approveMember(getDb(), memberId, await actor());
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/** Reject a pending member → inactive. */
export async function rejectMemberAction(
  memberId: string,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await transitionStatus(getDb(), memberId, "inactive", await actor());
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
