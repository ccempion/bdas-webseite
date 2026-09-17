"use server";

import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import {
  FLOW,
  loadFlowEnv,
  MAX_JSON_BYTES,
  nextStep,
  QUESTION_NAME,
  sanitizeAnswers,
  startJourney,
} from "@bdas/onboarding";

import { readSessionCookie } from "../../lib/auth-cookie";
import { resolveOnboardingLanding } from "./landing";

export type ResumeState = { readonly error?: string };

/**
 * Für Konten, die schon existieren, aber keine Journey haben (Spec §6): alter
 * Registrierungsweg, oder `startJourney` scheiterte bei der Registrierung.
 * Der Name kommt aus der Member-Zeile, nicht aus dem Formular.
 */
export async function resumeJourneyAction(
  _prev: ResumeState,
  formData: FormData,
): Promise<ResumeState> {
  requireFlag("onboarding");
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const landing = await resolveOnboardingLanding(db, me.user.id);
  if (landing !== "/mitmachen") redirect(landing ?? "/account");

  const raw = String(formData.get("answers") ?? "");
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES) return { error: "Eingabe zu groß." };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Deine Antworten sind verloren gegangen. Bitte fang neu an." };
  }

  const answers = {
    ...sanitizeAnswers(FLOW, parsed),
    [QUESTION_NAME]: { firstName: me.member.firstName, lastName: me.member.lastName },
  };
  const env = await loadFlowEnv(db);
  if (nextStep(FLOW, answers, env).kind !== "outcome") {
    return { error: "Bitte beantworte zuerst alle Fragen." };
  }

  try {
    await startJourney(db, { userId: me.user.id, answers, entrySource: formData.get("from"), env });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  redirect("/mitmachen/angaben");
}
