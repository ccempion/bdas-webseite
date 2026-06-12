import { getDb } from "@bdas/db";
import { listManagedEvents } from "@bdas/events-module";
import { getGroupBySlug } from "@bdas/groups";

import { requireGroupScope } from "../../../../_dashboard/session";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { EventsTable } from "../../../_components/EventsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function GroupEventsPage({ params }: { params: { slug: string } }) {
  const { me, groupId } = await requireGroupScope(params.slug);
  const db = getDb();
  const [events, group] = await Promise.all([
    listManagedEvents(db, viewerFrom(me)),
    getGroupBySlug(db, params.slug),
  ]);
  const groupEvents = events.filter((e) => e.groupId === groupId);
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">Events</h1>
      <EventsTable events={[...groupEvents]} groupNames={group ? { [group.id]: group.name } : {}} />
    </section>
  );
}
