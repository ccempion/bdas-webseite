"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { changePrimaryGroup, getCurrentMember } from "@bdas/members";
import { saveProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";

export type WizardActionState = {
  readonly ok?: boolean;
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function submitWizardAction(
  _prev: WizardActionState,
  formData: FormData,
): Promise<WizardActionState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  if (groupId === "") return { error: "Bitte wähle deine BDAS-Gruppe.", fields: { primaryGroupId: "Pflichtfeld." } };

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
    // Group first (members owns it). A pending member's choice applies directly;
    // an active member's would file a transfer request — either way the value is
    // recorded before we stamp completion.
    await changePrimaryGroup(db, me.member.id, groupId, { userId: me.user.id, grants: me.grants });
    await saveProfile(db, {
      userId: me.user.id,
      fields,
      actor: { userId: me.user.id, grants: me.grants },
      groupId,
    });
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) {
      const f = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return f ? { error: err.message, fields: f } : { error: err.message };
    }
    throw err;
  }
}
