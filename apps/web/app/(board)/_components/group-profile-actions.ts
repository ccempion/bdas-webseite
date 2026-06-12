"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { updateGroup } from "@bdas/groups";
import { canGrantLocalBoard, canManageGroup, getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

/** Update a group's profile. Gated: federal, or a board/lead of that group. */
export async function updateGroupProfileAction(
  groupId: string,
  input: { name: string; city: string },
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { ok: false, error: "Nicht angemeldet." };
  if (!canManageGroup(me.grants, groupId) && !canGrantLocalBoard(me.grants, groupId)) {
    return { ok: false, error: "Keine Berechtigung für diese Gruppe." };
  }
  try {
    await updateGroup(getDb(), groupId, input);
    revalidatePath(revalidate);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
