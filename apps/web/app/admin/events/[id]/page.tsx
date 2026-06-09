import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { canManage, getEvent } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../../../_events/flag";
import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { formatDateTime } from "../../../../lib/format";
import { ManageButtons } from "../ManageButtons";

export const metadata = { title: "Veranstaltung verwalten" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  cancelled: "Abgesagt",
};

export default async function ManageEventPage({ params }: { params: { id: string } }) {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  const viewer = viewerFrom(me);
  const event = await getEvent(db, params.id, viewer);
  if (!event || !canManage(viewer, event)) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-bdas-ink-muted">{formatDateTime(event.startsAt)}</p>
        <h1 className="text-2xl font-semibold text-bdas-ink">{event.title}</h1>
        <p className="text-sm text-bdas-ink-body">Status: {STATUS_LABEL[event.status]}</p>
      </header>

      <Card flat className="p-6">
        <p className="text-sm text-bdas-ink-muted">
          {event.capacity === null
            ? `${event.confirmedCount} angemeldet`
            : `${event.confirmedCount}/${event.capacity} Plätze belegt`}
          {event.waitlistCount > 0 ? ` · ${event.waitlistCount} auf der Warteliste` : ""}
        </p>
      </Card>

      <Card flat className="p-6">
        <ManageButtons eventId={event.id} status={event.status} />
      </Card>

      <Link href="/admin/events" className="text-sm text-bdas-red hover:underline">
        ← Zurück zur Übersicht
      </Link>
    </main>
  );
}
