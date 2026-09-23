"use server";

import { buildReactivationUrl, requestAccountDeletion } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { sendTransactional } from "@bdas/notifications";

import { bootAuth } from "../../lib/auth-bootstrap";
import { clearSessionCookie, readSessionCookie } from "../../lib/auth-cookie";
import { formatDate } from "../../lib/format";
import { bootNotifications } from "../../lib/notifications-bootstrap";

export type RequestAccountDeletionState = {
  readonly ok?: true;
  readonly error?: string;
};

export async function requestAccountDeletionAction(): Promise<RequestAccountDeletionState> {
  requireFlag("auth");
  requireFlag("account_deletion");
  bootAuth();
  bootNotifications();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!me.member) {
    return { error: "Es fehlen Profildaten für die Löschung. Bitte wende dich an den Vorstand." };
  }

  const displayName = `${me.member.firstName} ${me.member.lastName}`.trim();

  let result;
  try {
    result = await requestAccountDeletion(db, { userId: me.user.id, displayName });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  const reactivationUrl = buildReactivationUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    result.reactivationToken,
  );

  // The deletion already committed — a failed confirmation mail must not
  // tell the user their request didn't go through. Same pattern as
  // changePassword/requestEmailChange.
  try {
    await sendTransactional(db, "account_deletion_requested", me.member.id, {
      reactivationUrl,
      scheduledPurgeDate: formatDate(result.scheduledPurgeAt),
    });
  } catch (err) {
    console.error("[account-deletion] request confirmation email failed:", err);
  }

  // Every session was revoked by the request, this one included. Clearing
  // the now-stale cookie logs the browser out to match server-side state.
  clearSessionCookie();

  return { ok: true };
}
