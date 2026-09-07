import Link from "next/link";

import { Card } from "@bdas/design-system";
import type { MyRegistration } from "@bdas/events-module";

export type UpcomingEventsProps = {
  registrations: ReadonlyArray<MyRegistration>;
  /** Groups the member organises for — drives the "du organisierst" chip. */
  organizerGroupIds: ReadonlyArray<string>;
};

const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit" });
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "short" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * What the member has committed to. Rendered only when there is something —
 * an empty "no events" card on a personal overview is noise, not information.
 *
 * `flat` because the card itself is not a link: the lift is an affordance, and
 * the tappable targets here are the rows inside it (same call as `profileCard`).
 */
export function UpcomingEvents({ registrations, organizerGroupIds }: UpcomingEventsProps) {
  if (registrations.length === 0) return null;

  return (
    <Card flat className="p-6">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-bdas-ink">Deine nächsten Veranstaltungen</h2>
        <Link href="/events" className="text-sm text-bdas-ink-body hover:underline">
          Alle →
        </Link>
      </div>

      <ul className="flex flex-col">
        {registrations.map((r) => {
          const organises = r.groupId !== null && organizerGroupIds.includes(r.groupId);
          return (
            <li
              key={r.eventId}
              className="flex items-center gap-4 border-b border-bdas-soft py-3 last:border-b-0 last:pb-0"
            >
              <div className="w-14 shrink-0 rounded-bdas-sm border border-bdas-soft py-1.5 text-center leading-tight">
                <span className="block text-lg font-semibold text-bdas-ink">
                  {DAY.format(r.startsAt)}
                </span>
                <span className="block text-xs uppercase tracking-wide text-bdas-ink-muted">
                  {MONTH.format(r.startsAt)}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link
                  href={`/events/${r.eventId}`}
                  className="font-semibold text-bdas-ink hover:underline"
                >
                  {r.title}
                </Link>
                <span className="text-sm text-bdas-ink-muted">
                  {TIME.format(r.startsAt)} Uhr
                  {r.location ? ` · ${r.location}` : ""}
                  {r.waitlistPosition === null ? "" : ` · Warteliste, Platz ${r.waitlistPosition}`}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {organises ? (
                  <span className="rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-red">
                    du organisierst
                  </span>
                ) : null}
                <a
                  href={`/events/${r.eventId}/ics`}
                  className="rounded-bdas-sm border border-bdas-strong px-3 py-1 text-sm text-bdas-ink hover:bg-bdas-surface-hover"
                >
                  .ics
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
