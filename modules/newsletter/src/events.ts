/**
 * Events published by the newsletter module. `modules/notifications` holds
 * the subscriber and the templates; this module never sends mail and never
 * imports notifications (spec §2).
 */

/** Carries both tokens IN PLAINTEXT — the only place they exist after minting.
 *  Consumers must not log the event verbatim.
 *
 *  `unsubscribeUrl` rides along because the confirmation mail is the ONLY
 *  delivery this module ever makes to an anonymous address. If the key does not
 *  travel with it, `/newsletter/abmelden` is unreachable for anyone without an
 *  account, and "you can leave in one click" stops being true. */
export type ConfirmationRequested = {
  readonly type: "newsletter.confirmation_requested";
  readonly email: string;
  readonly token: string;
  readonly confirmUrl: string;
  readonly unsubscribeUrl: string;
  readonly at: Date;
};

/** Someone typed an address that is already on the list. The reply on screen
 *  is identical to a fresh signup; only the inbox tells them apart (spec §8). */
export type AlreadySubscribed = {
  readonly type: "newsletter.already_subscribed";
  readonly email: string;
  readonly at: Date;
};

export type NewsletterEvent = ConfirmationRequested | AlreadySubscribed;

/** Route paths owned by PR 3. Declared here so the confirmation URL is built
 *  in exactly one place. */
export const CONFIRM_PATH = "/newsletter/bestaetigen";
export const UNSUBSCRIBE_PATH = "/newsletter/abmelden";
