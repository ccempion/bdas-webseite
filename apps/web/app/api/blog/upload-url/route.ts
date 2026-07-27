import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getBlogMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { CONTENT_IMAGE, tooLargeMessage } from "../../../_upload/accept";

export const dynamic = "force-dynamic";

/**
 * Mint a signed upload URL for an inline post image. Gated the same way as
 * authoring: any signed-in (registered) user may upload. The app never proxies
 * bytes — the client PUTs directly to the signed URL (spec §11).
 */
export async function POST(req: Request) {
  if (!isFlagOn("blog")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

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
  const storageKey = `${me.user.id}/${crypto.randomUUID()}.${ext}`;
  const storage = getBlogMediaStorage();
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
