import { savePage } from "@bdas/content";
import type { SaveScope } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { getGroupBySlug } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { groupPageSlug } from "../../../../../lib/content-scope";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { slug: string[] } }) {
  if (!isFlagOn("content")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const db = getDb();
  const me = await getCurrentMember(db, session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const slugPath = params.slug.join("/");
  const gSlug = groupPageSlug(slugPath);
  let scope: SaveScope | undefined;
  if (gSlug !== null) {
    if (!isFlagOn("groups")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });
    const group = await getGroupBySlug(db, gSlug);
    if (!group || group.status === "archived") {
      return Response.json({ error: "Gruppe nicht gefunden." }, { status: 404 });
    }
    scope = { groupId: group.id };
  }

  const body = (await req.json().catch(() => null)) as { data?: unknown } | null;
  if (!body || body.data === undefined) {
    return Response.json({ error: "Es fehlt das Seitendokument (data)." }, { status: 422 });
  }

  try {
    const page = await savePage(db, {
      slug: slugPath,
      data: body.data,
      actor: { userId: me.user.id, grants: me.grants },
      ...(scope ? { scope } : {}),
    });
    return Response.json({ ok: true, updatedAt: page.updatedAt.toISOString() });
  } catch (err) {
    if (isAppError(err)) {
      return Response.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }
}
