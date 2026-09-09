/**
 * Public surface of the newsletter module (CLAUDE.md §1 rule 8).
 *
 * Private and deliberately not re-exported: `schema.ts`, `tokens.ts`,
 * `rate-limit.ts`, `consent-log.ts`, `test-db.ts`, and the resolver *getter* —
 * consumers wire a resolver, they never read one.
 */
export {
  subscribeAsUser,
  subscribeAtRegistration,
  subscribePublicly,
  type SubscribeAsUserInput,
  type SubscribeAtRegistrationInput,
  type SubscribePubliclyInput,
} from "./services/subscribe";
export {
  confirmSubscription,
  peekUnsubscribeToken,
  unsubscribeAsUser,
  unsubscribeByToken,
} from "./services/confirm";
export {
  countSubscribers,
  getSubscriptionForAccount,
  listSubscribers,
  type SubscriberFilter,
} from "./services/read";
export { type NewsletterAccount } from "./account-match";
export {
  declineForUser,
  shouldPrompt,
  MAX_DISMISSALS,
  PROMPT_INTERVAL_MS,
} from "./services/prompts";
export { registerNewsletterSubscribers } from "./subscribers";
export { setAccountEmailResolver, type AccountEmailResolver } from "./resolver";
export {
  CONFIRM_PATH,
  UNSUBSCRIBE_PATH,
  type AlreadySubscribed,
  type ConfirmationRequested,
  type NewsletterEvent,
} from "./events";
export {
  NEWSLETTER_SOURCES,
  type ConfirmResult,
  type ConsentContext,
  type Counts,
  type NewsletterSource,
  type SubscriberRow,
  type Subscription,
  type SubscriptionStatus,
} from "./types";
