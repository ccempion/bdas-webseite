"use server";

import { register } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError, ValidationError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createProfile } from "@bdas/members";
import {
  FLOW,
  loadFlowEnv,
  MAX_JSON_BYTES,
  nextStep,
  QUESTION_NAME,
  sanitizeAnswers,
  startJourney,
} from "@bdas/onboarding";

import { bootAuth } from "../../lib/auth-bootstrap";
import { clientIp, finishRegistration } from "../registrieren/finish";

export type CreateAccountState = {
  readonly error?: string;
  readonly fields?: Record<string, string>;
  readonly sentTo?: string;
};

/**
 * Teil 2 des Wizards (Spec §4.2, §5.3 Punkt 2). Das Ergebnis rechnet der
 * Server selbst nach; was der Browser außer den Antworten mitschickt, fällt
 * in `sanitizeAnswers` heraus.
 */
export async function createAccountAction(
  _prev: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  requireFlag("auth");
  requireFlag("onboarding");
  bootAuth();
  const db = getDb();

  const rawAnswers = String(formData.get("answers") ?? "");
  if (Buffer.byteLength(rawAnswers, "utf8") > MAX_JSON_BYTES) {
    return { error: "Eingabe zu groß." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAnswers);
  } catch {
    return { error: "Deine Antworten sind verloren gegangen. Bitte fang neu an." };
  }

  const answers = sanitizeAnswers(FLOW, parsed);
  const env = await loadFlowEnv(db);
  const name = answers[QUESTION_NAME];
  if (
    nextStep(FLOW, answers, env).kind !== "outcome" ||
    typeof name !== "object" ||
    !("firstName" in name)
  ) {
    return { error: "Bitte beantworte zuerst alle Fragen." };
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "true";
  const ip = clientIp();

  let result;
  try {
    result = await register(
      db,
      { email, password, consent },
      { ip, publicSiteUrl: process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000" },
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return err.fields ? { error: err.message, fields: err.fields } : { error: err.message };
    }
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  // Ab hier existiert das Konto. Nichts darf die Antwort mehr scheitern lassen:
  // eine fehlende Member-Zeile oder Journey holt der erste Login nach (PR 4).
  try {
    await createProfile(db, {
      userId: result.userId,
      firstName: name.firstName,
      lastName: name.lastName,
    });
  } catch (err) {
    console.error("[onboarding] createProfile after register failed:", err);
  }
  try {
    await startJourney(db, {
      userId: result.userId,
      answers,
      entrySource: formData.get("from"),
      env,
    });
  } catch (err) {
    console.error("[onboarding] startJourney after register failed:", err);
  }

  await finishRegistration({
    userId: result.userId,
    email,
    verifyToken: result.verifyToken,
    newsletter: formData.get("newsletter") === "true",
    sourcePath: "/mitmachen",
    ip,
  });

  return { sentTo: email.trim() };
}
