import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { getEvent, getMyRegistration, renderEventContentHtml } from "@bdas/events-module";
import { getCurrentMember } from "@bdas/members";
import { eventMediaPublicUrl } from "@bdas/storage";

import { requireEventsFlag } from "../../_events/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { viewerFrom } from "../../../lib/event-viewer";
import { formatDateTime } from "../../../lib/format";
import { GuestRegisterForm } from "./GuestRegisterForm";
import { RegisterControls } from "./RegisterControls";

export const metadata = { title: "Veranstaltung" };

function renderSlot(heading: string, html: string) {
  if (!html) return null;
  return (
    <Card flat className="p-6">
      <h2 className="mb-2 text-lg font-semibold text-bdas-ink">{heading}</h2>
      <div
        className="prose max-w-none text-bdas-ink-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Card>
  );
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const event = await getEvent(db, params.id, viewerFrom(me));
  if (!event) notFound();

  const myReg = me?.member ? await getMyRegistration(db, event.id, me.member.id) : null;

  const slots = {
    body: renderEventContentHtml(event.content?.body),
    agenda: renderEventContentHtml(event.content?.agenda),
    directions: renderEventContentHtml(event.content?.directions),
    bring: renderEventContentHtml(event.content?.bring),
  };
  // Only worth a jump link when something actually sits between the header and
  // the registration card.
  const showJumpToRegistration = Object.values(slots).some(Boolean);

  // Non-members may sign up only on published, public events that opted in.
  const guestRegistrationOpen =
    event.status === "published" && event.visibility === "public" && event.allowGuestRegistration;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      {event.coverImageKey ? (
        <img
          src={eventMediaPublicUrl(event.coverImageKey)}
          alt=""
          className="mb-2 w-full rounded-bdas object-cover"
        />
      ) : null}

      {event.status !== "published" ? (
        <Alert variant="info" title="Vorschau">
          Diese Veranstaltung ist noch nicht veröffentlicht. Nur Verwalter sehen diese Seite.
        </Alert>
      ) : null}

      <header className="flex flex-col gap-2">
        <p className="text-sm text-bdas-ink-muted">
          {formatDateTime(event.startsAt)}
          {event.endsAt ? ` – ${formatDateTime(event.endsAt)}` : ""}
        </p>
        <h1 className="text-3xl font-semibold text-bdas-ink">{event.title}</h1>
        {event.locationName ? (
          <a
            href={
              event.locationLat !== null && event.locationLng !== null
                ? `https://www.google.com/maps/search/?api=1&query=${event.locationLat},${event.locationLng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.locationName)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-bdas border border-bdas-soft px-3 py-1.5 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover"
          >
            📍 {event.locationName} — Route öffnen
          </a>
        ) : null}
      </header>

      {showJumpToRegistration ? (
        <a
          href="#anmeldung"
          className="group inline-flex w-fit items-center gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-1.5 text-sm font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-soft"
        >
          Direkt zur Anmeldung
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="h-4 w-4 text-bdas-red transition-transform duration-bdas-soft ease-bdas group-hover:translate-y-0.5 group-focus-visible:translate-y-0.5"
          >
            <path d="M12 5v14" />
            <path d="m19 12-7 7-7-7" />
          </svg>
        </a>
      ) : null}

      {renderSlot("Beschreibung", slots.body)}
      {renderSlot("Ablauf", slots.agenda)}
      {renderSlot("Anfahrt", slots.directions)}
      {renderSlot("Mitbringen", slots.bring)}

      <Card id="anmeldung" flat className="scroll-mt-6 p-6">
        <p className="mb-4 text-sm text-bdas-ink-muted">
          {event.capacity === null
            ? `${event.confirmedCount} angemeldet`
            : `${event.confirmedCount}/${event.capacity} Plätze belegt${
                event.waitlistCount > 0 ? ` · ${event.waitlistCount} auf der Warteliste` : ""
              }`}
        </p>

        {event.registrationDeadline && event.registrationDeadline < new Date() ? (
          <Alert variant="info">Die Anmeldefrist ist abgelaufen.</Alert>
        ) : me?.member ? (
          <RegisterControls
            eventId={event.id}
            registered={myReg !== null}
            waitlistPosition={myReg?.waitlistPosition ?? null}
          />
        ) : guestRegistrationOpen ? (
          <div className="flex flex-col gap-3">
            <GuestRegisterForm eventId={event.id} />
            {!me ? (
              <p className="text-sm text-bdas-ink-muted">
                Bereits Mitglied?{" "}
                <Link href="/anmelden" className="text-bdas-red hover:underline">
                  Melde dich an
                </Link>
                , um dich mit deinem Konto anzumelden.
              </p>
            ) : null}
          </div>
        ) : !me ? (
          <Alert variant="info">
            Bitte{" "}
            <Link href="/anmelden" className="text-bdas-red hover:underline">
              melde dich an
            </Link>
            , um teilzunehmen.
          </Alert>
        ) : (
          <Alert variant="info">
            Bitte{" "}
            <Link href="/account" className="text-bdas-red hover:underline">
              lege dein Profil an
            </Link>
            , um dich anzumelden.
          </Alert>
        )}

        <a
          href={`/events/${event.id}/ics`}
          className="mt-4 block text-sm text-bdas-red hover:underline"
        >
          Zum Kalender hinzufügen
        </a>
      </Card>
    </main>
  );
}
