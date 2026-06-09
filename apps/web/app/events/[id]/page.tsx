import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { getEvent, getMyRegistration } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../../_events/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";
import { formatDateTime } from "../../../lib/format";
import { RegisterControls } from "./RegisterControls";

export const metadata = { title: "Veranstaltung" };

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const event = await getEvent(db, params.id, viewerFrom(me));
  if (!event) notFound();

  const myReg = me?.member ? await getMyRegistration(db, event.id, me.member.id) : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-bdas-ink-muted">
          {formatDateTime(event.startsAt)}
          {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
        </p>
        <h1 className="text-3xl font-semibold text-bdas-ink">{event.title}</h1>
        {event.location ? <p className="text-bdas-ink-body">{event.location}</p> : null}
      </header>

      {event.descriptionMd ? (
        <Card flat className="p-6">
          <p className="whitespace-pre-wrap text-bdas-ink-body">{event.descriptionMd}</p>
        </Card>
      ) : null}

      <Card flat className="p-6">
        <p className="mb-4 text-sm text-bdas-ink-muted">
          {event.capacity === null
            ? `${event.confirmedCount} angemeldet`
            : `${event.confirmedCount}/${event.capacity} Plätze belegt${
                event.waitlistCount > 0 ? ` · ${event.waitlistCount} auf der Warteliste` : ""
              }`}
        </p>

        {!me ? (
          <Alert variant="info">
            Bitte{" "}
            <Link href="/anmelden" className="text-bdas-red hover:underline">
              melde dich an
            </Link>
            , um teilzunehmen.
          </Alert>
        ) : !me.member ? (
          <Alert variant="info">
            Bitte{" "}
            <Link href="/account" className="text-bdas-red hover:underline">
              lege dein Profil an
            </Link>
            , um dich anzumelden.
          </Alert>
        ) : (
          <RegisterControls
            eventId={event.id}
            registered={myReg !== null}
            waitlistPosition={myReg?.waitlistPosition ?? null}
          />
        )}
      </Card>
    </main>
  );
}
