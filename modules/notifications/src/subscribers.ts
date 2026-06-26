/**
 * Bridge the events module's bus events to transactional sends.
 *
 * The events module emits member-scoped events via the core bus (@bdas/events);
 * this module subscribes and renders/sends the matching transactional email.
 * Dependency is one-way (notifications → events-module types + public read
 * service) per CLAUDE.md §1 rules 2/3 — no cross-module table reads, no cycle.
 *
 * The events producer publishes AFTER its own transaction commits (see
 * events/registration.ts), so a thrown handler does not roll anything back —
 * it would surface an error to the originating action's caller after the write
 * already succeeded. Handlers must therefore never throw: every handler body is
 * wrapped in `safe()`, `eventTitle` swallows read failures, and
 * `sendTransactional` records send failures as a logged 'failed' row.
 */
import type { Db } from "@bdas/db";
import { getEventBus, type AnyEvent, type EventHandler, type Subscription } from "@bdas/events";
import { getEvent, type Viewer } from "@bdas/events-module";
import type { EventRegistered, EventDeregistered, WaitlistPromoted } from "@bdas/events-module";

import { sendTransactional } from "./services/send";

/** System reader: sees everything, so the title lookup is never visibility-gated. */
const SYSTEM_VIEWER: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
};

let subs: Subscription[] = [];

/**
 * Wrap a handler so it can never throw into the bus. The producer publishes
 * after commit, so an escaping error would only fail the originating action
 * after its write already succeeded — a notification problem must not do that.
 * Failures are logged, not propagated.
 */
function safe<E extends AnyEvent>(fn: EventHandler<E>): EventHandler<E> {
  return async (e: E) => {
    try {
      await fn(e);
    } catch (err) {
      console.error(`[notifications] handler for "${e.type}" failed:`, err);
    }
  };
}

async function eventTitle(db: Db, eventId: string): Promise<string> {
  try {
    const ev = await getEvent(db, eventId, SYSTEM_VIEWER);
    return ev?.title ?? "deine Veranstaltung";
  } catch {
    return "deine Veranstaltung";
  }
}

/**
 * Wire the bus → send handlers. Closes over `db` (core/db has no test-injection
 * seam, and every service here takes an explicit db). Idempotent.
 *
 * `opts.siteUrl` is the public base URL (e.g. https://dashboard.bdas.de),
 * supplied by the app at composition time — the module never reads env itself.
 * When present, the "you're on the event" emails carry a link to the event page
 * so the recipient can cancel their registration there. The deregistration
 * email gets no link (they have already left).
 */
export function registerNotificationSubscribers(db: Db, opts: { siteUrl?: string } = {}): void {
  if (subs.length > 0) return;

  const eventUrl = (eventId: string): string | undefined =>
    opts.siteUrl
      ? `${opts.siteUrl.replace(/\/$/, "")}/events/${encodeURIComponent(eventId)}`
      : undefined;

  subs = [
    getEventBus().subscribe<EventRegistered>(
      "events.event.registered",
      safe<EventRegistered>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        await sendTransactional(
          db,
          e.waitlisted ? "event_waitlisted" : "event_registration_confirmed",
          e.memberId,
          { eventTitle: title, eventId: e.eventId, eventUrl: eventUrl(e.eventId) },
        );
      }),
    ),
    getEventBus().subscribe<EventDeregistered>(
      "events.event.deregistered",
      safe<EventDeregistered>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        await sendTransactional(db, "event_deregistration_confirmed", e.memberId, {
          eventTitle: title,
          eventId: e.eventId,
        });
      }),
    ),
    getEventBus().subscribe<WaitlistPromoted>(
      "events.waitlist.promoted",
      safe<WaitlistPromoted>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        await sendTransactional(db, "event_waitlist_promoted", e.memberId, {
          eventTitle: title,
          eventId: e.eventId,
          eventUrl: eventUrl(e.eventId),
        });
      }),
    ),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterNotificationSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
