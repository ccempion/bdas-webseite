"use server";

import {
  buildEmailChangeUrl,
  getCurrentUser,
  getNotifier,
  requestEmailChange,
} from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";

import { bootAuth } from "../../lib/auth-bootstrap";
import { readSessionCookie } from "../../lib/auth-cookie";

export type EmailChangeState = {
  /** Set only on a successful request — the form uses it to collapse. */
  readonly ok?: true;
  readonly error?: string;
};

export async function requestEmailChangeAction(
  _prev: EmailChangeState,
  formData: FormData,
): Promise<EmailChangeState> {
  requireFlag("auth");
  bootAuth();

  const db = getDb();
  const me = await getCurrentUser(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  const newEmail = String(formData.get("newEmail") ?? "");
  const currentPassword = String(formData.get("currentPassword") ?? "");

  let result;
  try {
    result = await requestEmailChange(db, { currentPassword, newEmail }, { userId: me.id });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  const confirmUrl = buildEmailChangeUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    result.changeToken,
  );

  // Neither send failing should tell the user the request didn't happen —
  // the pending change already exists and the confirm link is the one that
  // matters. Log and continue, same pattern as register/changePassword.
  try {
    await getNotifier().send({ kind: "email-change-verify", to: result.newEmailDisplay, confirmUrl });
  } catch (err) {
    console.error("[auth] email-change verify send failed:", err);
  }
  try {
    await getNotifier().send({
      kind: "email-change-notice",
      to: me.email,
      newEmail: result.newEmailDisplay,
    });
  } catch (err) {
    console.error("[auth] email-change notice send failed:", err);
  }

  return { ok: true };
}
