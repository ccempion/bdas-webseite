/**
 * Events emitted by the events module via the core event bus (@bdas/events).
 * Subscribers (the `notifications` module, next PR) depend on these types, not
 * on the producing services (CLAUDE.md §3). There is no consumer yet.
 */

export type EventPublished = {
  readonly type: "events.event.published";
  readonly eventId: string;
  readonly groupId: string | null;
  readonly at: Date;
};

export type EventCancelled = {
  readonly type: "events.event.cancelled";
  readonly eventId: string;
  readonly at: Date;
};

/** What materially changed on an edit, for registrant change-notifications. */
export type EventChange = "time" | "location";

export type EventUpdated = {
  readonly type: "events.event.updated";
  readonly eventId: string;
  readonly changed: ReadonlyArray<EventChange>;
  readonly at: Date;
};

export type EventRegistered = {
  readonly type: "events.event.registered";
  readonly eventId: string;
  readonly memberId: string;
  readonly waitlisted: boolean;
  readonly at: Date;
};

export type EventDeregistered = {
  readonly type: "events.event.deregistered";
  readonly eventId: string;
  readonly memberId: string;
  readonly at: Date;
};

export type WaitlistPromoted = {
  readonly type: "events.waitlist.promoted";
  readonly eventId: string;
  readonly memberId: string;
  readonly at: Date;
};

export type EventsEvent =
  | EventPublished
  | EventCancelled
  | EventUpdated
  | EventRegistered
  | EventDeregistered
  | WaitlistPromoted;
