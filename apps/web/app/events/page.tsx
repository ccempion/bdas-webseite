import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listUpcomingEvents } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../_events/flag";
import { readSessionCookie } from "../../lib/auth-cookie";
import { viewerFrom } from "../../lib/event-viewer";
import { formatDateTime } from "../../lib/format";

export const metadata = { title: "Veranstaltungen" };

export default async function EventsPage() {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const events = await listUpcomingEvents(db, viewerFrom(me));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Veranstaltungen</h1>
        <p className="text-bdas-ink-body">Kommende Veranstaltungen des BDAS.</p>
      </header>

      {events.length === 0 ? (
        <Alert variant="info" title="Keine Veranstaltungen">
          Aktuell sind keine kommenden Veranstaltungen geplant.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((e) => {
            const full = e.capacity !== null && e.confirmedCount >= e.capacity;
            return (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="block focus:outline-none">
                  <Card className="p-5">
                    <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
                    <h2 className="mt-1 text-lg font-semibold text-bdas-ink">{e.title}</h2>
                    {e.location ? (
                      <p className="mt-1 text-sm text-bdas-ink-body">{e.location}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-bdas-ink-muted">
                      {e.capacity === null
                        ? `${e.confirmedCount} angemeldet`
                        : `${e.confirmedCount}/${e.capacity} Plätze${full ? ` · Warteliste ${e.waitlistCount}` : ""}`}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
