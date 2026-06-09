"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { cancelRegistration, registerMember } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type RegState = {
  readonly error?: string;
  readonly ok?: boolean;
};

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
