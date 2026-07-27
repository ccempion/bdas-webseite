import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { canEditGroupPage, getCurrentMember, isFederalBoard } from "@bdas/members";
import { getContentMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { groupPageSlug } from "../../../../lib/content-scope";
import { CONTENT_IMAGE, tooLargeMessage } from "../../../_upload/accept";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(getDb(), session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    slug?: string;
  } | null;

  const gSlug = groupPageSlug(body?.slug ?? "");
  if (gSlug !== null) {
    if (!isFlagOn("groups")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });
    const group = await getGroupBySlug(getDb(), gSlug);
    if (!group || group.status === "archived") {
      return Response.json({ error: "Gruppe nicht gefunden." }, { status: 404 });
    }
    if (!canEditGroupPage(me.grants, group.id)) {
      return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
    }
  } else if (!isFederalBoard(me.grants)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  if (!body?.mimeType || !CONTENT_IMAGE.mime.includes(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > CONTENT_IMAGE.maxBytes) {
    return Response.json({ error: tooLargeMessage(CONTENT_IMAGE) }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  const prefix = (body.slug ?? "").replace(/[^a-z0-9/-]/g, "").replace(/\//g, "-") || "seite";
  const storageKey = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const storage = getContentMediaStorage();
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
