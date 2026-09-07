import { createId } from "@bdas/id";

/** Where a subscription was captured. Metadata for later segmentation
 *  without building a picker UI today (spec §4). */
export const NEWSLETTER_SOURCES = [
  "footer",
  "registrierung",
  "registrierung_erfolg",
  "konto",
  "dashboard_hinweis",
  "blog",
  "event_gast",
  "puck_block",
  "scroll_panel",
  "landingpage",
] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

/** `declined` is factually distinct from `unsubscribed`: the person was
 *  never on the list, they only clicked the hints away three times (§4). */
export type SubscriptionStatus = "pending" | "subscribed" | "unsubscribed" | "declined";

export type ConsentEvent =
  | "subscribed"
  | "confirmed"
  | "resubscribed"
  | "unsubscribed"
  | "declined";

/** IP and user agent for the consent log, plus the site URL the confirmation
 *  link is built from. All optional: a server-side caller may have none. */
export type ConsentContext = {
  readonly ip?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
  readonly siteUrl?: string | null | undefined;
};

export type Subscription = {
  readonly id: string;
  /** The stored duplicate key — NOT necessarily the current account address. */
  readonly email: string;
  readonly userId: string | null;
  readonly status: SubscriptionStatus;
  readonly source: NewsletterSource;
  readonly sourcePath: string | null;
  readonly groupId: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly unsubscribedAt: Date | null;
};

/** A row for the board list and the CSV export: `email` is resolved, so for
 *  rows with an account it is the current login address (spec §4). */
export type SubscriberRow = {
  readonly id: string;
  readonly email: string;
  readonly status: SubscriptionStatus;
  readonly source: NewsletterSource;
  readonly sourcePath: string | null;
  readonly groupId: string | null;
  readonly hasAccount: boolean;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
};

export type Counts = {
  readonly pending: number;
  readonly subscribed: number;
  readonly unsubscribed: number;
  readonly declined: number;
};

/** `expired` also covers an unknown token: the two are indistinguishable once
 *  a link is old, and both deserve the same friendly "sign up again" page. */
export type ConfirmResult = { readonly status: "confirmed" | "already_confirmed" | "expired" };

export const newId = (): string => createId("nls");
export const newConsentId = (): string => createId("nlc");
