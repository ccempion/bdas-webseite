/**
 * Public types for the notifications module.
 */

/** The transactional emails this slice can send. */
export type TransactionalTemplate =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_deregistration_confirmed"
  | "event_waitlist_promoted";

/** Data interpolated into a transactional template. */
export type TemplateData = {
  /** Recipient's given name for the salutation. */
  readonly firstName: string;
  /** Human-readable event title. */
  readonly eventTitle: string;
  /** Absolute URL of the event page, for the "manage/cancel registration" link.
   * Omitted on the deregistration email and when no site URL is configured. */
  readonly eventUrl?: string | undefined;
};

/** Outcome of a send attempt, returned by sendTransactional. */
export type SendResult = {
  readonly status: "sent" | "failed";
  readonly logId: string;
};

/** Recipient identity resolved at composition time (see resolver.ts). */
export type RecipientContact = {
  readonly email: string;
  readonly firstName: string;
};
