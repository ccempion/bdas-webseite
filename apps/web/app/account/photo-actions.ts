"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getProfile, saveProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";

export type SavePhotoState = {
  readonly notice?: string;
  readonly error?: string;
};

/**
 * Persist a freshly uploaded profile photo on its own, so the avatar control at
 * the top of /account saves immediately instead of waiting on the extended
 * profile form far below it.
 *
 * `member_profiles` carries NOT NULL study fields and `saveProfile` validates
 * the whole record, so there is no photo-only write at the module level. This
 * re-submits the stored values unchanged with the new key — which also means a
 * member without a profile row yet cannot set a photo here; they get pointed at
 * the extended profile instead of a silent no-op.
 */
export async function savePhotoAction(storageKey: string): Promise<SavePhotoState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const key = storageKey.trim();
  if (key === "") return { error: "Kein Bild ausgewählt." };

  const existing = await getProfile(db, me.user.id);
  if (!existing) {
    return {
      error: "Bitte fülle zuerst das erweiterte Profil aus, dann kannst du ein Bild setzen.",
    };
  }

  try {
    await saveProfile(db, {
      userId: me.user.id,
      fields: {
        studiengang: existing.studiengang,
        abschlussart: existing.abschlussart,
        uni: existing.uni,
        geburtsdatum: existing.geburtsdatum,
        gefundenDurch: existing.gefundenDurch,
        empfehlerName: existing.empfehlerName,
        photoStorageKey: key,
      },
      actor: { userId: me.user.id, grants: me.grants },
      groupId: me.member.primaryGroupId ?? null,
    });
    revalidatePath("/account");
    return { notice: "Profilbild aktualisiert." };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
