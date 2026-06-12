import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { EventsTable } from "../../_components/EventsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function FederalEventsPage() {
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const [events, groups] = await Promise.all([
    listManagedEvents(db, viewerFrom(me)),
    listGroups(db),
  ]);
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Events</h1>
      <EventsTable events={[...events]} groupNames={groupNames} />
    </section>
  );
}
