import { getDb } from "@bdas/db";
import { canManage, getEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getEventMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { CONTENT_IMAGE, tooLargeMessage } from "../../../../_upload/accept";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isFlagOn("events")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  if (!body?.mimeType || !CONTENT_IMAGE.mime.includes(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > CONTENT_IMAGE.maxBytes) {
    return Response.json({ error: tooLargeMessage(CONTENT_IMAGE) }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storageKey = `${event.id}/${crypto.randomUUID()}.${ext}`;
  const storage = getEventMediaStorage();
  const signed = await storage.signedUploadUrl({
    storageKey,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  return Response.json({
    uploadUrl: signed.url,
    publicUrl: storage.publicUrl(storageKey),
    storageKey,
  });
}
