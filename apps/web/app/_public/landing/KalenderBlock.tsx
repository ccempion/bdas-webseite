import { getDb } from "@bdas/db";
import { Section } from "@bdas/design-system";
import { listUpcomingEvents } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";

import { loadCurrentMember } from "../../_dashboard/session";
import { viewerFrom } from "../../../lib/event-viewer";
import { toCalendarEvents } from "./calendar-events";
import { EventCalendar } from "./EventCalendar";

/** Public calendar with facets: visitors get `public` events; logged-in
 *  members additionally get members_only + their group's group_only events —
 *  the visibility filter runs server-side in listUpcomingEvents.
 *
 *  Uses `loadCurrentMember` (cached per request, see _dashboard/session.ts)
 *  rather than calling `getCurrentMember` directly, so a landing render that
 *  also touches a board layout doesn't pay for the grants join twice. */
export async function KalenderBlock() {
  const db = getDb();
  const me = await loadCurrentMember();
  const [events, groups] = await Promise.all([
    listUpcomingEvents(db, viewerFrom(me)),
    listGroups(db, { status: "active" }),
  ]);

  return (
    <Section title="Veranstaltungen" intro="Alle Termine auf einen Blick.">
      <EventCalendar
        events={toCalendarEvents(events)}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />
    </Section>
  );
}
