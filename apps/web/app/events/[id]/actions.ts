"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { cancelRegistration, registerGuest, registerMember } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type RegState = {
  readonly error?: string;
  readonly ok?: boolean;
};

export type GuestRegState = {
  readonly error?: string;
  readonly ok?: boolean;
  readonly waitlisted?: boolean;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function revalidate(eventId: string): void {
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

export async function registerAction(_prev: RegState, formData: FormData): Promise<RegState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = String(formData.get("eventId") ?? "");
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!me.member) return { error: "Bitte lege zuerst dein Profil an." };

  try {
    await registerMember(getDb(), eventId, me.member.id);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidate(eventId);
  return { ok: true };
}

/** Non-member guest sign-up. Requires explicit consent to store name + email
 *  (ADR 0008 / GDPR posture). The events service re-checks event eligibility. */
export async function registerGuestAction(
  _prev: GuestRegState,
  formData: FormData,
): Promise<GuestRegState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (name.length < 2) return { error: "Bitte gib deinen Namen an." };
  if (!EMAIL_RE.test(email)) return { error: "Bitte gib eine gültige E-Mail-Adresse an." };
  if (!consent) return { error: "Bitte stimme der Verarbeitung deiner Daten zu." };

  try {
    const result = await registerGuest(getDb(), eventId, { name, email });
    revalidate(eventId);
    return { ok: true, waitlisted: result.status === "waitlisted" };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

export async function cancelAction(_prev: RegState, formData: FormData): Promise<RegState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = String(formData.get("eventId") ?? "");
  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    await cancelRegistration(getDb(), eventId, me.member.id);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidate(eventId);
  return { ok: true };
}
