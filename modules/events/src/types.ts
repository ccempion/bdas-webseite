/**
 * Domain types for the events module's public surface. The DB row shapes
 * (`EventRow`, `EventRegistrationRow`) are internal.
 *
 * The domain object is `EventItem` (not `Event`) to avoid shadowing the global
 * DOM `Event` in consuming web components.
 */

/** A Tiptap/ProseMirror document node. Opaque to consumers; rendered server-side. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };

/** Structured rich content for an event. Empty slots are omitted on render. */
export type EventContent = {
  readonly body?: TiptapDoc | null;
  readonly agenda?: TiptapDoc | null;
  readonly directions?: TiptapDoc | null;
  readonly bring?: TiptapDoc | null;
};

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
  readonly content: EventContent | null;
  readonly coverImageKey: string | null;
  readonly summary: string | null;
  readonly registrationDeadline: Date | null;
  readonly locationName: string | null;
  readonly locationAddress: string | null;
  readonly locationLat: number | null;
  readonly locationLng: number | null;
  /** null = unlimited capacity. */
  readonly capacity: number | null;
  /** Opt-in non-member sign-ups; only meaningful when the event is public. */
  readonly allowGuestRegistration: boolean;
  readonly visibility: EventVisibility;
  readonly status: EventStatus;
  readonly createdBy: string;
};

export type EventRegistration = {
  readonly id: string;
  readonly eventId: string;
  /** null for a guest registration (identified by guestEmail instead). */
  readonly memberId: string | null;
  readonly guestName: string | null;
  readonly guestEmail: string | null;
  readonly registeredAt: Date;
  readonly cancelledAt: Date | null;
  /** null = confirmed; >=1 = waitlisted at that rank. */
  readonly waitlistPosition: number | null;
};

export type RegistrationResult = {
  readonly status: "registered" | "waitlisted";
  readonly waitlistPosition: number | null;
};

export type RosterStatus = "confirmed" | "waitlisted";

/** One active registration as the manage roster sees it. For members, identity
 *  (name/email) is resolved by the app via members/auth — this module owns only
 *  `memberId` (CLAUDE.md §1 rule 1). Guest identity, by contrast, lives on the
 *  registration row itself (guests are not members), so it is carried here. */
export type RosterRow = {
  readonly registrationId: string;
  /** null for a guest registration. */
  readonly memberId: string | null;
  /** Set for a guest registration; null for a member. */
  readonly guestName: string | null;
  readonly guestEmail: string | null;
  readonly status: RosterStatus;
  /** null = confirmed; >=1 = waitlisted at that rank. */
  readonly waitlistPosition: number | null;
  readonly registeredAt: Date;
};

/** Per-event counts for list/detail rendering. */
export type EventWithCounts = EventItem & {
  readonly confirmedCount: number;
  readonly waitlistCount: number;
};
