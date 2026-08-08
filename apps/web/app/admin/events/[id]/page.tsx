import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { canManage, getEvent } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";
import { listBroadcastsForEvent } from "@bdas/notifications";

import { requireEventsFlag } from "../../../_events/flag";
import { readSessionCookie } from "../../../../lib/auth-cookie";
import { viewerFrom } from "../../../../lib/event-viewer";
import { loadRoster } from "../../../../lib/event-roster";
import { formatDateTime } from "../../../../lib/format";
import { ManageButtons } from "../ManageButtons";
import { BroadcastHistory } from "./BroadcastHistory";
import { CancelRegistrationButton } from "./CancelRegistrationButton";
import { EmailRegistrants } from "./EmailRegistrants";

const ROSTER_STATUS_LABEL: Record<string, string> = {
  confirmed: "Bestätigt",
  waitlisted: "Warteliste",
};

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

  const roster = await loadRoster(event.id);
  const broadcasts = await listBroadcastsForEvent(db, event.id);

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
        <div className="flex gap-3 mb-4">
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="text-sm text-bdas-red hover:underline"
          >
            Bearbeiten
          </Link>
          <Link
            href={`/events/${event.id}?vorschau=1`}
            className="text-sm text-bdas-red hover:underline"
          >
            Vorschau ansehen
          </Link>
        </div>
        <ManageButtons eventId={event.id} status={event.status} />
      </Card>

      <Card flat className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-bdas-ink">Teilnehmende</h2>
          {roster.length > 0 ? (
            <a
              href={`/admin/events/${event.id}/roster.csv`}
              className="text-sm text-bdas-red hover:underline"
            >
              Als CSV exportieren
            </a>
          ) : null}
        </div>

        {roster.length === 0 ? (
          <p className="text-sm text-bdas-ink-muted">Noch keine Anmeldungen.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-bdas-soft text-bdas-ink-muted">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Angemeldet</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.registrationId} className="border-b border-bdas-soft last:border-0">
                  <td className="py-2 text-bdas-ink">
                    {r.name}
                    {r.isGuest ? (
                      <span className="ml-2 text-xs text-bdas-ink-muted">(Gast)</span>
                    ) : null}
                  </td>
                  <td className="py-2 text-bdas-ink-body">{ROSTER_STATUS_LABEL[r.status]}</td>
                  <td className="py-2 text-bdas-ink-muted">{formatDateTime(r.registeredAt)}</td>
                  <td className="py-2 text-right">
                    <CancelRegistrationButton
                      eventId={event.id}
                      registrationId={r.registrationId}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card flat className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-bdas-ink">Teilnehmende benachrichtigen</h2>
        <p className="mb-4 text-sm text-bdas-ink-muted">
          Sendet eine E-Mail an alle bestätigten Teilnehmenden ({event.confirmedCount}).
        </p>
        <EmailRegistrants eventId={event.id} recipientCount={event.confirmedCount} />
      </Card>

      <Card flat className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-bdas-ink">Bisherige Nachrichten</h2>
        <BroadcastHistory broadcasts={broadcasts} />
      </Card>

      <Link href="/admin/events" className="text-sm text-bdas-red hover:underline">
        ← Zurück zur Übersicht
      </Link>
    </main>
  );
}
