import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { canManage, getEvent } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";
import { eventMediaPublicUrl } from "@bdas/storage";

import { requireEventsFlag } from "../../../../_events/flag";
import { readSessionCookie } from "../../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../../lib/event-viewer";
import { utcToBerlinLocalInput } from "../../../../lib/datetime";
import { EventEditForm } from "./EventEditForm";

export const metadata = { title: "Veranstaltung bearbeiten" };

/** Prefill datetime-local inputs with the event's Europe/Berlin wall time. */
function toLocal(d: Date | null): string {
  return d ? utcToBerlinLocalInput(d) : "";
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  requireEventsFlag();
  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) notFound();

  const allGroups = await listGroups(db, { status: "active" });
  const groups = viewer.isFederal
    ? allGroups
    : allGroups.filter((g) => viewer.boardGroupIds.includes(g.id));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Veranstaltung bearbeiten</h1>
      <Card flat className="p-6">
        <EventEditForm
          d={{
            eventId: event.id,
            title: event.title,
            summary: event.summary,
            content: event.content,
            coverImageKey: event.coverImageKey,
            coverImageUrl: event.coverImageKey ? eventMediaPublicUrl(event.coverImageKey) : null,
            startsAtLocal: toLocal(event.startsAt),
            endsAtLocal: toLocal(event.endsAt),
            registrationDeadlineLocal: toLocal(event.registrationDeadline),
            capacity: event.capacity,
            visibility: event.visibility,
            allowGuestRegistration: event.allowGuestRegistration,
            location: event.locationName
              ? {
                  name: event.locationName,
                  address: event.locationAddress ?? "",
                  lat: event.locationLat,
                  lng: event.locationLng,
                }
              : null,
            groups: groups.map((g) => ({ id: g.id, name: g.name })),
            allowFederation: viewer.isFederal,
            groupId: event.groupId,
          }}
        />
      </Card>
    </main>
  );
}
