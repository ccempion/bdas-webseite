import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember, isFederalBoard } from "@bdas/members";
import { getContentMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap for page imagery
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: Request) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(getDb(), session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  if (!isFederalBoard(me.grants)) {
    return Response.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
    slug?: string;
  } | null;
  if (!body?.mimeType || !ALLOWED.has(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json({ error: "Datei zu groß (max. 10 MB)." }, { status: 422 });
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
