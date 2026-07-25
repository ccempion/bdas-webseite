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
import { getEvent, listRegistrations, type Viewer } from "@bdas/events-module";
import type {
  EventCancelled,
  EventDeregistered,
  EventRegistered,
  EventUpdated,
  WaitlistPromoted,
} from "@bdas/events-module";
import { getGroup } from "@bdas/groups";
import { getMemberByUserId, listBoardRecipientsForGroup } from "@bdas/members";
import type { RoleGranted, RoleRevoked } from "@bdas/members";
import type { ProfileCompleted } from "@bdas/profile";

import { sendTransactional, sendTransactionalToGuest } from "./services/send";

/** System reader: sees everything, so the title lookup is never visibility-gated. */
const SYSTEM_VIEWER: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
  organizerGroupIds: [],
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

  // A guest's self-cancel link — the "manage/cancel" link in their emails, since
  // guests have no login. Requires both the site URL and the per-guest token.
  const guestCancelUrl = (eventId: string, token: string | null | undefined): string | undefined =>
    opts.siteUrl && token
      ? `${opts.siteUrl.replace(/\/$/, "")}/events/${encodeURIComponent(
          eventId,
        )}/gast-abmelden?token=${encodeURIComponent(token)}`
      : undefined;

  subs = [
    getEventBus().subscribe<EventRegistered>(
      "events.event.registered",
      safe<EventRegistered>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        const template = e.waitlisted ? "event_waitlisted" : "event_registration_confirmed";
        if (e.memberId) {
          await sendTransactional(db, template, e.memberId, {
            eventTitle: title,
            eventId: e.eventId,
            eventUrl: eventUrl(e.eventId),
          });
        } else if (e.guestEmail) {
          await sendTransactionalToGuest(
            db,
            template,
            { email: e.guestEmail, name: e.guestName },
            {
              eventTitle: title,
              eventId: e.eventId,
              eventUrl: guestCancelUrl(e.eventId, e.guestCancelToken),
            },
          );
        }
      }),
    ),
    getEventBus().subscribe<EventDeregistered>(
      "events.event.deregistered",
      safe<EventDeregistered>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        if (e.memberId) {
          await sendTransactional(db, "event_deregistration_confirmed", e.memberId, {
            eventTitle: title,
            eventId: e.eventId,
          });
        } else if (e.guestEmail) {
          await sendTransactionalToGuest(
            db,
            "event_deregistration_confirmed",
            { email: e.guestEmail, name: e.guestName },
            { eventTitle: title, eventId: e.eventId },
          );
        }
      }),
    ),
    getEventBus().subscribe<WaitlistPromoted>(
      "events.waitlist.promoted",
      safe<WaitlistPromoted>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        if (e.memberId) {
          await sendTransactional(db, "event_waitlist_promoted", e.memberId, {
            eventTitle: title,
            eventId: e.eventId,
            eventUrl: eventUrl(e.eventId),
          });
        } else if (e.guestEmail) {
          await sendTransactionalToGuest(
            db,
            "event_waitlist_promoted",
            { email: e.guestEmail, name: e.guestName },
            {
              eventTitle: title,
              eventId: e.eventId,
              eventUrl: guestCancelUrl(e.eventId, e.guestCancelToken),
            },
          );
        }
      }),
    ),
    // A published event's date/time/location changed — notify every active
    // registrant (confirmed + waitlist).
    getEventBus().subscribe<EventUpdated>(
      "events.event.updated",
      safe<EventUpdated>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        const roster = await listRegistrations(db, e.eventId);
        for (const r of roster) {
          if (r.memberId) {
            await sendTransactional(db, "event_changed", r.memberId, {
              eventTitle: title,
              eventId: e.eventId,
              eventUrl: eventUrl(e.eventId),
              changes: e.changed,
            });
          } else if (r.guestEmail) {
            await sendTransactionalToGuest(
              db,
              "event_changed",
              { email: r.guestEmail, name: r.guestName },
              {
                eventTitle: title,
                eventId: e.eventId,
                eventUrl: eventUrl(e.eventId),
                changes: e.changed,
              },
            );
          }
        }
      }),
    ),
    // The event was cancelled — notify every active registrant.
    getEventBus().subscribe<EventCancelled>(
      "events.event.cancelled",
      safe<EventCancelled>(async (e) => {
        const title = await eventTitle(db, e.eventId);
        const roster = await listRegistrations(db, e.eventId);
        for (const r of roster) {
          if (r.memberId) {
            await sendTransactional(db, "event_cancelled", r.memberId, {
              eventTitle: title,
              eventId: e.eventId,
            });
          } else if (r.guestEmail) {
            await sendTransactionalToGuest(
              db,
              "event_cancelled",
              { email: r.guestEmail, name: r.guestName },
              { eventTitle: title, eventId: e.eventId },
            );
          }
        }
      }),
    ),
    // A member was granted/removed as event_organizer for a group (ADR 0017) —
    // email only that member; ignore every other role's grant events.
    getEventBus().subscribe<RoleGranted>(
      "members.role.granted",
      safe<RoleGranted>(async (e) => {
        if (e.role !== "event_organizer" || !e.groupId) return;
        const group = await getGroup(db, e.groupId);
        await sendTransactional(db, "event_organizer_granted", e.memberId, {
          groupName: group?.name,
          eventUrl: opts.siteUrl ? `${opts.siteUrl.replace(/\/$/, "")}/admin/events` : undefined,
        });
      }),
    ),
    getEventBus().subscribe<RoleRevoked>(
      "members.role.revoked",
      safe<RoleRevoked>(async (e) => {
        if (e.role !== "event_organizer" || !e.groupId) return;
        const group = await getGroup(db, e.groupId);
        await sendTransactional(db, "event_organizer_revoked", e.memberId, {
          groupName: group?.name,
        });
      }),
    ),
    getEventBus().subscribe<ProfileCompleted>(
      "profile.completed",
      safe<ProfileCompleted>(async (e) => {
        const applicant = await getMemberByUserId(db, e.userId);
        // Only genuine applications (pending members) notify the board; an
        // already-active member backfilling their profile does not.
        if (applicant?.status !== "pending") return;
        const recipients = await listBoardRecipientsForGroup(db, e.groupId);
        for (const memberId of recipients) {
          await sendTransactional(db, "member_application_received", memberId, {
            applicantName: `${applicant.firstName} ${applicant.lastName}`,
          });
        }
      }),
    ),
  ];
}

/** Test helper: drop all subscriptions. Not part of the public surface. */
export function unregisterNotificationSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
