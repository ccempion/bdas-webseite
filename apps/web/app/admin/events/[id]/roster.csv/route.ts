import { getDb } from "@bdas/db";
import { canManage, getEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { loadRoster } from "../../../../../lib/event-roster";
import { rosterToCsv } from "../../../../../lib/roster-csv";

export const dynamic = "force-dynamic";

/** Roster CSV (door list / catering). Manage-level gate — `canManage`, not the
 *  public `canView` the ICS route uses — since this exposes registrant PII. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isFlagOn("events")) return new Response("Not found", { status: 404 });
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) return new Response("Not found", { status: 404 });

  const csv = rosterToCsv(await loadRoster(params.id));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="event-${event.id}-roster.csv"`,
    },
  });
}
