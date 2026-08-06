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
import {
  getGroupChangeRequest,
  listBoardRecipientsForGroup,
  REJECTION_CATEGORY_LABELS,
} from "@bdas/members";
import type {
  GroupChangeDecided,
  GroupChangeWithdrawn,
  RejectionCategory,
  RoleGranted,
  RoleRevoked,
} from "@bdas/members";
import { getPostById, type PostReported } from "@bdas/blog";

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
/** The members module owns the labels; the board's dropdown reads the same map. */
const categoryLabel = (key: string | null): string | undefined =>
  key !== null && key in REJECTION_CATEGORY_LABELS
    ? REJECTION_CATEGORY_LABELS[key as RejectionCategory]
    : undefined;

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
    // An application is a request row (ADR 0031), so these mails hang off the
    // request's lifecycle. `profile.completed` no longer routes any of them:
    // the wizard stopped collecting a group, so it has nothing to route by.
    //
    // DISABLED: the "eine Freigabe wartet auf dich" mail to the destination
    // board (`members.group_change.requested` → `member_application_received`).
    // It fired per board member on every request, including plain group
    // transfers, with no batching, no digest and no per-recipient preference —
    // to be wired properly later. The template and its `NotificationTemplate`
    // key are deliberately kept so re-enabling is re-adding the subscription
    // here. The board still sees pending Freigaben as the in-app badge.
    // The board decided — tell the applicant, who otherwise waits without ever
    // hearing back. A transfer between groups is not an application and needs
    // no such mail.
    getEventBus().subscribe<GroupChangeDecided>(
      "members.group_change.decided",
      safe<GroupChangeDecided>(async (e) => {
        if (e.fromGroupId !== null) return;
        if (e.decision === "approved") {
          await sendTransactional(db, "member_application_approved", e.memberId, {});
        } else {
          // The reason lives on the row, not on the event.
          const request = await getGroupChangeRequest(db, e.requestId);
          await sendTransactional(db, "member_application_declined", e.memberId, {
            reasonCategoryLabel: categoryLabel(request?.reasonCategory ?? null),
            reasonMessage: request?.reasonMessage ?? undefined,
          });
        }
      }),
    ),
    // Their group was archived out from under them. Nobody judged them, so the
    // mail must not read as a rejection. A member withdrawing their own
    // application gets nothing.
    getEventBus().subscribe<GroupChangeWithdrawn>(
      "members.group_change.withdrawn",
      safe<GroupChangeWithdrawn>(async (e) => {
        if (e.actorUserId !== "system") return;
        const request = await getGroupChangeRequest(db, e.requestId);
        const group = request?.toGroupId ? await getGroup(db, request.toGroupId) : null;
        await sendTransactional(db, "member_application_group_dissolved", e.memberId, {
          groupName: group?.name,
        });
      }),
    ),
    getEventBus().subscribe<PostReported>(
      "blog.post.reported",
      safe<PostReported>(async (e) => {
        const post = await getPostById(db, e.postId);
        const recipients = await listBoardRecipientsForGroup(db, null); // null → federal board
        for (const memberId of recipients) {
          await sendTransactional(db, "blog_post_reported", memberId, {
            postTitle: post?.title ?? "ein Beitrag",
            postUrl:
              post && opts.siteUrl
                ? `${opts.siteUrl.replace(/\/$/, "")}/blog/${post.slug}`
                : undefined,
            reportReason: e.reason ?? undefined,
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
