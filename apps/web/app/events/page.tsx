import Link from "next/link";

import { getDb } from "@bdas/db";
import { Alert, Card } from "@bdas/design-system";
import { listPastEvents, listUpcomingEvents, type EventWithCounts } from "@bdas/events-module";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireEventsFlag } from "../_events/flag";
import { readSessionCookie } from "../../lib/auth-cookie";
import { viewerFrom } from "../../lib/event-viewer";
import { formatDateTime } from "../../lib/format";
import { EventFilterBar } from "./EventFilterBar";
import {
  deriveOwners,
  filterByGroups,
  parseSelected,
  type GroupInfo,
} from "./event-filter";

export const metadata = { title: "Veranstaltungen" };

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function EventCard({ e, past }: { e: EventWithCounts; past: boolean }) {
  const full = e.capacity !== null && e.confirmedCount >= e.capacity;
  return (
    <Link href={`/events/${e.id}`} className="block focus:outline-none">
      <Card className={past ? "p-5 opacity-70" : "p-5"}>
        <div className="flex items-center gap-2">
          <p className="text-sm text-bdas-ink-muted">{formatDateTime(e.startsAt)}</p>
          {past ? (
            <span className="rounded-bdas-sm bg-bdas-overlay-faint px-2 py-0.5 text-xs text-bdas-ink-muted">
              Vorbei
            </span>
          ) : null}
        </div>
        <h2 className={past ? "mt-1 text-lg font-semibold text-bdas-ink-muted" : "mt-1 text-lg font-semibold text-bdas-ink"}>
          {e.title}
        </h2>
        {e.location ? <p className="mt-1 text-sm text-bdas-ink-body">{e.location}</p> : null}
        {past ? null : (
          <p className="mt-2 text-sm text-bdas-ink-muted">
            {e.capacity === null
              ? `${e.confirmedCount} angemeldet`
              : `${e.confirmedCount}/${e.capacity} Plätze${full ? ` · Warteliste ${e.waitlistCount}` : ""}`}
          </p>
        )}
      </Card>
    </Link>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  requireEventsFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  const viewer = viewerFrom(me);
  const showPast = firstParam(searchParams["past"]) === "1";

  const [upcoming, groups] = await Promise.all([listUpcomingEvents(db, viewer), listGroups(db)]);
  const pastEvents = showPast ? await listPastEvents(db, viewer) : [];

  const groupById = new Map<string, GroupInfo>(
    groups.map((g) => [g.id, { name: g.name, slug: g.slug }]),
  );
  const chips = deriveOwners([...upcoming, ...pastEvents], groupById);
  const validKeys = new Set(chips.map((c) => c.key));
  const selected = parseSelected(firstParam(searchParams["groups"]), validKeys);

  const upcomingShown = filterByGroups(upcoming, selected, groupById);
  const pastShown = filterByGroups(pastEvents, selected, groupById);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">Veranstaltungen</h1>
        <p className="text-bdas-ink-body">Kommende Veranstaltungen des BDAS.</p>
      </header>

      <EventFilterBar chips={chips} selected={selected} past={showPast} />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-bdas-ink-muted">
          Kommende
        </h2>
        {upcomingShown.length === 0 ? (
          <Alert variant="info" title="Keine Veranstaltungen">
            {selected.size > 0
              ? "Keine kommenden Veranstaltungen für diese Auswahl."
              : "Aktuell sind keine kommenden Veranstaltungen geplant."}
          </Alert>
        ) : (
          <ul className="flex flex-col gap-4">
            {upcomingShown.map((e) => (
              <li key={e.id}>
                <EventCard e={e} past={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {showPast ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-bdas-ink-muted">
            Vergangene
          </h2>
          {pastShown.length === 0 ? (
            <Alert variant="info" title="Keine vergangenen Veranstaltungen">
              Für diese Auswahl gibt es keine vergangenen Veranstaltungen.
            </Alert>
          ) : (
            <ul className="flex flex-col gap-4">
              {pastShown.map((e) => (
                <li key={e.id}>
                  <EventCard e={e} past={true} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
