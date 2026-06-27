import { getDb } from "@bdas/db";
import { eventToIcs, getEvent } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isFlagOn("events")) return new Response("Not found", { status: 404 });
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event) return new Response("Not found", { status: 404 });

  const ics = eventToIcs(event);
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="event-${event.id}.ics"`,
    },
  });
}
