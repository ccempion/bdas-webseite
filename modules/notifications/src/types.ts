/**
 * Public types for the notifications module.
 */

/** The transactional emails this slice can send. */
export type TransactionalTemplate =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_deregistration_confirmed"
  | "event_waitlist_promoted"
  | "event_changed"
  | "event_cancelled"
  | "event_organizer_message"
  | "event_organizer_granted"
  | "event_organizer_revoked"
  | "member_application_received"
  | "blog_post_reported";

/** Which aspects of an event changed, for the `event_changed` email. */
export type EventChangeKind = "time" | "location";

/** Data interpolated into a transactional template. */
export type TemplateData = {
  /** Recipient's given name for the salutation. */
  readonly firstName: string;
  /** Human-readable event title. */
  readonly eventTitle: string;
  /** Absolute URL of the event page, for the "manage/cancel registration" link.
   * Omitted on the deregistration email and when no site URL is configured. */
  readonly eventUrl?: string | undefined;
  /** `event_changed`: which aspects changed, to phrase the email. */
  readonly changes?: ReadonlyArray<EventChangeKind> | undefined;
  /** `event_organizer_message`: organizer-authored subject + body. */
  readonly subject?: string | undefined;
  readonly messageBody?: string | undefined;
  /** `event_organizer_*`: the group the organizer role applies to. */
  readonly groupName?: string | undefined;
  /** `member_application_received`: the applicant's full name. */
  readonly applicantName?: string | undefined;
  /** `blog_post_reported`: the reported post's title. */
  readonly postTitle?: string | undefined;
  /** `blog_post_reported`: absolute URL to the reported post, if a site URL is configured. */
  readonly postUrl?: string | undefined;
  /** `blog_post_reported`: the reporter's optional free-text reason. */
  readonly reportReason?: string | undefined;
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
