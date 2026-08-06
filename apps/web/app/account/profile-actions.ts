"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { changePrimaryGroup, getCurrentMember } from "@bdas/members";
import { saveProfile } from "@bdas/profile";

import { purgeUnreferencedPhoto } from "../_profile/photo-url";
import { readSessionCookie } from "../../lib/auth-cookie";

export type EditProfileState = {
  /** See ProfileFormState.ok — same reason, same consumer. */
  readonly ok?: true;
  readonly notice?: string;
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function saveProfileFieldsAction(
  _prev: EditProfileState,
  formData: FormData,
): Promise<EditProfileState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  const fields = {
    studiengang: String(formData.get("studiengang") ?? "").trim(),
    abschlussart: String(formData.get("abschlussart") ?? ""),
    uni: String(formData.get("uni") ?? "").trim(),
    geburtsdatum: String(formData.get("geburtsdatum") ?? ""),
    gefundenDurch: String(formData.get("gefundenDurch") ?? ""),
    empfehlerName: String(formData.get("empfehlerName") ?? "").trim() || null,
    photoStorageKey: String(formData.get("photoStorageKey") ?? "").trim() || null,
  };

  try {
    if (groupId !== "") {
      await changePrimaryGroup(db, me.member.id, groupId, {
        userId: me.user.id,
        grants: me.grants,
      });
    }
    const { supersededPhotoStorageKey } = await saveProfile(db, {
      userId: me.user.id,
      fields,
      actor: { userId: me.user.id, grants: me.grants },
      groupId: groupId || (me.member.primaryGroupId ?? null),
    });
    // "Foto ersetzen" in this form swaps the stored key; the object it pointed
    // at is now unreachable and should not outlive it (spec §7).
    await purgeUnreferencedPhoto(supersededPhotoStorageKey, me.user.id);

    revalidatePath("/account");
    return { ok: true, notice: "Profil gespeichert." };
  } catch (err) {
    if (isAppError(err)) {
      const f = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return f ? { error: err.message, fields: f } : { error: err.message };
    }
    throw err;
  }
}
