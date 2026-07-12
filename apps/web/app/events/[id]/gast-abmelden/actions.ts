"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { cancelGuestByToken } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";

export type GuestCancelState = {
  readonly error?: string;
  readonly ok?: boolean;
};

/** Confirm a guest self-cancellation via the token from their email. The token
 *  is the sole credential — no session — so the events service validates it. */
export async function cancelGuestAction(
  _prev: GuestCancelState,
  formData: FormData,
): Promise<GuestCancelState> {
  if (!isFlagOn("events")) return { error: "Nicht verfügbar." };
  const eventId = String(formData.get("eventId") ?? "");
  const token = String(formData.get("token") ?? "");
  if (!token) return { error: "Ungültiger Abmeldelink." };

  try {
    await cancelGuestByToken(getDb(), eventId, token);
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true };
}
