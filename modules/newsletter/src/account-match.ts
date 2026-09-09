import { eq, or, type SQL } from "drizzle-orm";

import { newsletterSubscribers } from "./schema";

/**
 * An account, as this module has to recognise it: its id AND its address.
 *
 * Both, because a row can carry either. Someone who signs up through a public
 * form leaves a row with no `user_id` — it is only adopted into an account
 * when `auth.user.verified` happens to fire afterwards. Sign up *after* the
 * account is already verified and that moment has passed: the row keeps the
 * address and never learns the id.
 */
export type NewsletterAccount = {
  readonly userId: string;
  readonly email: string;
};

/** The stored duplicate key is always trimmed and lower-cased (see the
 *  subscribe services), so a match has to be too. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * The one condition every account-scoped read and write goes through.
 *
 * It exists as a single exported expression rather than as four copies of
 * `or(...)` because the asymmetry it fixes was caused by exactly that: the
 * write path matched on both, the read paths matched on the id alone, and a
 * subscriber was shown the signup form they had already filled in.
 */
export const accountMatch = (account: NewsletterAccount): SQL | undefined =>
  or(
    eq(newsletterSubscribers.userId, account.userId),
    eq(newsletterSubscribers.email, normalizeEmail(account.email)),
  );
