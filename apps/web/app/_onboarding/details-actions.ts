"use server";

import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import {
  completeJourney,
  FLOW,
  getJourneyForUser,
  loadFlowEnv,
  MAX_JSON_BYTES,
  nextStep,
  saveDetails,
} from "@bdas/onboarding";
import { saveProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";
import { purgeUnreferencedPhoto } from "../_profile/photo-url";
import { restoreDetails, toProfileFields } from "./details";

export type SubmitState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

/** Zwischenstand von Teil 3. Ein Fehler hier darf den Wizard nie aufhalten. */
export async function saveDetailsAction(values: unknown): Promise<void> {
  try {
    requireFlag("onboarding");
    const db = getDb();
    const me = await getCurrentMember(db, readSessionCookie());
    if (!me) return;
    await saveDetails(db, { userId: me.user.id, details: restoreDetails(values) });
  } catch (err) {
    console.error("[onboarding] saveDetails failed:", err);
  }
}

/**
 * Bewerbung abschicken (Spec §5.3 Punkt 4). Der Nutzertyp kommt aus dem
 * nachgerechneten Ergebnis, das Antragsziel aus `completeJourney` — aus dem
 * Formular zählen nur die Profilwerte.
 */
export async function submitApplicationAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  requireFlag("profile");
  requireFlag("onboarding");
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };
  const actor = { userId: me.user.id, grants: me.grants };

  const journey = await getJourneyForUser(db, me.user.id);
  if (!journey) redirect("/mitmachen");
  if (journey.status === "abgeschickt") redirect("/mitmachen/fertig");

  const raw = String(formData.get("values") ?? "");
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) return { error: "Eingabe zu groß." };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Deine Angaben sind verloren gegangen. Bitte lade die Seite neu." };
  }

  const env = await loadFlowEnv(db);
  const step = nextStep(FLOW, journey.answers, env);
  const outcome = step.kind === "outcome" ? step.outcome : journey.outcome;
  const userType = FLOW.outcomes[outcome].userType;

  try {
    const { supersededPhotoStorageKey } = await saveProfile(db, {
      userId: me.user.id,
      fields: toProfileFields(userType, restoreDetails(parsed)),
      actor,
      groupId: null,
    });
    await purgeUnreferencedPhoto(supersededPhotoStorageKey, me.user.id);
    await completeJourney(db, { memberId: me.member.id, actor, env });
  } catch (err) {
    if (isAppError(err)) {
      const f = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return f ? { error: err.message, fields: f } : { error: err.message };
    }
    throw err;
  }

  // Outside the try: redirect() signals by throwing.
  redirect("/mitmachen/fertig");
}
