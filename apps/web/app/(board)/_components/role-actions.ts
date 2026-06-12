"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { getCurrentMember, grantRole, revokeRole } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

/** Server Actions are public endpoints; only ever revalidate board routes. */
function safeRevalidate(path: string): void {
  if (path.startsWith("/federal/") || path.startsWith("/gruppe/")) revalidatePath(path);
}

async function actor() {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) throw new Error("Nicht angemeldet.");
  return { userId: me.user.id, grants: me.grants };
}

/**
 * Grant/revoke a board role. WHO may do WHAT is enforced inside
 * grantRole/revokeRole (ADR 0013) against the session-derived actor —
 * memberId/role/groupId from the client cannot widen authority.
 */
export async function grantRoleAction(
  memberId: string,
  role: string,
  groupId: string | null,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await grantRole(getDb(), memberId, role, await actor(), groupId);
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

export async function revokeRoleAction(
  memberId: string,
  role: string,
  groupId: string | null,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await revokeRole(getDb(), memberId, role, await actor(), groupId);
    safeRevalidate(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
