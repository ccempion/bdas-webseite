import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getProfileMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { PROFILE_IMAGE, tooLargeMessage } from "../../../_upload/accept";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isFlagOn("profile")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(getDb(), session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  if (!body?.mimeType || !PROFILE_IMAGE.mime.includes(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > PROFILE_IMAGE.maxBytes) {
    return Response.json({ error: tooLargeMessage(PROFILE_IMAGE) }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Own-photo-only: the key is always prefixed with the actor's own user id.
  const storageKey = `${me.user.id}/${crypto.randomUUID()}.${ext}`;
  const storage = getProfileMediaStorage();
  const signed = await storage.signedUploadUrl({
    storageKey,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  return Response.json({ uploadUrl: signed.url, storageKey });
}
