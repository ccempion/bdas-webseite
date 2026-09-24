"use server";

import { getDb } from "@bdas/db";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { sendTransactional, sendTransactionalToGuest } from "@bdas/notifications";

import { readSessionCookie } from "../../lib/auth-cookie";
import { buildDataExport, principalFrom, toZip } from "../../lib/data-export/assemble";
import { realReaders } from "../../lib/data-export/readers";
import { bootNotifications } from "../../lib/notifications-bootstrap";

export type SendDataExportState = {
  readonly ok?: true;
  readonly error?: string;
};

export async function sendDataExportAction(): Promise<SendDataExportState> {
  requireFlag("auth");
  requireFlag("account_deletion");
  bootNotifications();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };

  // The principal comes from the session only — this action takes no argument.
  const data = await buildDataExport(realReaders(), principalFrom(me));
  const attachments = [{ filename: "bdas-datenexport.zip", content: Buffer.from(toZip(data)) }];

  const result = me.member
    ? await sendTransactional(db, "data_export_ready", me.member.id, { attachments })
    : await sendTransactionalToGuest(
        db,
        "data_export_ready",
        { email: me.user.email, name: null },
        { attachments },
      );

  if (!result || result.status !== "sent") {
    return { error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut." };
  }
  return { ok: true };
}
