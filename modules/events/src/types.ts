/**
 * Domain types for the events module's public surface. The DB row shapes
 * (`EventRow`, `EventRegistrationRow`) are internal.
 *
 * The domain object is `EventItem` (not `Event`) to avoid shadowing the global
 * DOM `Event` in consuming web components.
 */

export type EventStatus = "draft" | "published" | "cancelled";
export type EventVisibility = "public" | "members_only" | "group_only";

export type EventItem = {
  readonly id: string;
  /** null = federation-wide (federal board). */
  readonly groupId: string | null;
  readonly title: string;
  readonly descriptionMd: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly location: string | null;
  readonly locationUrl: string | null;
  /** null = unlimited capacity. */
  readonly capacity: number | null;
  readonly visibility: EventVisibility;
  readonly status: EventStatus;
  readonly createdBy: string;
};

export type EventRegistration = {
  readonly id: string;
  readonly eventId: string;
  readonly memberId: string;
  readonly registeredAt: Date;
  readonly cancelledAt: Date | null;
  /** null = confirmed; >=1 = waitlisted at that rank. */
  readonly waitlistPosition: number | null;
};

export type RegistrationResult = {
  readonly status: "registered" | "waitlisted";
  readonly waitlistPosition: number | null;
};

/** Per-event counts for list/detail rendering. */
export type EventWithCounts = EventItem & {
  readonly confirmedCount: number;
  readonly waitlistCount: number;
};
