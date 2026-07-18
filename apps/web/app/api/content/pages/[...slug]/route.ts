import { savePage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../../lib/auth-cookie";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { slug: string[] } }) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const db = getDb();
  const me = await getCurrentMember(db, session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || body.data === undefined) {
    return Response.json({ error: "Es fehlt das Seitendokument (data)." }, { status: 422 });
  }

  try {
    const page = await savePage(db, {
      slug: params.slug.join("/"),
      data: body.data,
      actor: { userId: me.user.id, grants: me.grants },
    });
    return Response.json({ ok: true, updatedAt: page.updatedAt.toISOString() });
  } catch (err) {
    if (isAppError(err)) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }
}
