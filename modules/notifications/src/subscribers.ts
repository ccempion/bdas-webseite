/**
 * Bridge the events module's bus events to transactional sends.
 *
 * The events module emits member-scoped events via the core bus (@bdas/events);
 * this module subscribes and renders/sends the matching transactional email.
 * Dependency is one-way (notifications → events-module types + public read
 * service) per CLAUDE.md §1 rules 2/3 — no cross-module table reads, no cycle.
 *
 * The bus runs handlers synchronously inside the producer's flow, so a thrown
 * handler would roll back the producer's transaction. Handlers must therefore
 * never throw: `eventTitle` swallows read failures and `sendTransactional`
 * already swallows send failures into a logged 'failed' row.
 */
import type { Db } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
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
 */
export function registerNotificationSubscribers(db: Db): void {
  if (subs.length > 0) return;

  subs = [
    getEventBus().subscribe<EventRegistered>("events.event.registered", async (e) => {
      const title = await eventTitle(db, e.eventId);
      await sendTransactional(
        db,
        e.waitlisted ? "event_waitlisted" : "event_registration_confirmed",
        e.memberId,
        { eventTitle: title, eventId: e.eventId },
      );
    }),
    getEventBus().subscribe<EventDeregistered>("events.event.deregistered", async (e) => {
      const title = await eventTitle(db, e.eventId);
      await sendTransactional(db, "event_deregistration_confirmed", e.memberId, {
        eventTitle: title,
        eventId: e.eventId,
      });
    }),
    getEventBus().subscribe<WaitlistPromoted>("events.waitlist.promoted", async (e) => {
      const title = await eventTitle(db, e.eventId);
      await sendTransactional(db, "event_waitlist_promoted", e.memberId, {
        eventTitle: title,
        eventId: e.eventId,
      });
    }),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterNotificationSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
