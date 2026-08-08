"use server";

import { revalidatePath } from "next/cache";

import type { GroupLocation } from "@bdas/groups";
import { getDb } from "@bdas/db";
import { getGroup, updateGroup } from "@bdas/groups";
import { canGrantLocalBoard, getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type GroupProfileInput = {
  name: string;
  city: string;
  contactEmail: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  location: GroupLocation | null;
  imageKey: string | null;
};

/** Server Actions are public endpoints; only ever revalidate board routes. */
function safeRevalidate(path: string): void {
  if (path.startsWith("/federal/") || path.startsWith("/gruppe/")) revalidatePath(path);
}

/**
 * Update a group's master data. Gated to the federal board and the group's own
 * `local_board_lead` (`canGrantLocalBoard`, ADR 0013) — the same authority that
 * reaches `/gruppe/<slug>/profil`. A Server Action must never be looser than
 * the page that calls it.
 *
 * `status` and `slug` are deliberately not part of the input: status stays with
 * the federal board, and the slug is the immutable public URL.
 */
export async function updateGroupProfileAction(
  groupId: string,
  input: GroupProfileInput,
  revalidate: string,
): Promise<{ ok: boolean; error?: string }> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { ok: false, error: "Nicht angemeldet." };
  if (!canGrantLocalBoard(me.grants, groupId)) {
    return { ok: false, error: "Keine Berechtigung für diese Gruppe." };
  }
  try {
    const db = getDb();
    // `updateGroup` is full-replace, so carry over the one field this form does
    // not own — otherwise a save would reset the group to "active".
    const existing = await getGroup(db, groupId);
    if (!existing) return { ok: false, error: "Gruppe nicht gefunden." };
    if (existing.status === "archived") {
      return { ok: false, error: "Archivierte Gruppen können nicht bearbeitet werden." };
    }
    await updateGroup(db, groupId, { ...input, status: existing.status });
    safeRevalidate(revalidate);
    // The public list is statically renderable, so a renamed or relocated group
    // would stay stale there until the next deploy. `/gruppen/[slug]` is
    // force-dynamic and needs no revalidation.
    revalidatePath("/gruppen");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}
