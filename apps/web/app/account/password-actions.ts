"use server";

import { changePassword, getCurrentUser, getNotifier } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";
import { readSessionCookie, setSessionCookie } from "../../lib/auth-cookie";

export type ChangePasswordState = {
  /** Set only on a successful change — the form uses it to collapse. */
  readonly ok?: true;
  readonly error?: string;
};

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  requireFlag("auth");
  bootAuth();

  const db = getDb();
  const me = await getCurrentUser(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  // The client checks this too, for the faster feedback. This one is the
  // binding check: a Server Action is a public endpoint.
  if (newPassword !== confirmPassword) {
    return { error: "Die beiden neuen Passwörter stimmen nicht überein." };
  }

  let result;
  try {
    result = await changePassword(
      db,
      { currentPassword: String(formData.get("currentPassword") ?? ""), newPassword },
      { userId: me.id },
    );
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  // The change revoked every session, this request's included. Without the
  // replacement cookie the user would be signed out by their own password
  // change.
  setSessionCookie(result.token);

  try {
    // `me.email` is the address getCurrentUser already resolved — the
    // service has no reason to hand it back.
    await getNotifier().send({ kind: "changed", to: me.email });
  } catch (err) {
    // The new password is already committed. A failed notification must not
    // tell the user their change didn't happen — log it and report success.
    console.error("[auth] password change email send failed:", err);
  }

  return { ok: true };
}
