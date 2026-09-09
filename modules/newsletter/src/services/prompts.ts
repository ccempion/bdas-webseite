/**
 * The re-prompt memory behind the two interrupting hints (spec §6.1).
 *
 * Server-side rather than in the browser, so the decision follows the person
 * across their devices — and so §25 TDDDG never applies in the first place.
 */
import { eq, sql } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { accountMatch, type NewsletterAccount } from "../account-match";
import { recordConsent } from "../consent-log";
import { resolveOne } from "../resolver";
import { newsletterPrompts, newsletterSubscribers } from "../schema";
import { hashToken, newToken } from "../tokens";
import { newId, type ConsentContext } from "../types";

/** "Not now" lasts a fortnight. */
export const PROMPT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** Three dismissals are an answer (spec §6.1). */
export const MAX_DISMISSALS = 3;

/**
 * One dismissal. On the third, the account moves to `declined` and is never
 * asked again — the point at which "offensiv" would tip into "nervig".
 */
export async function declineForUser(
  db: Db,
  input: { readonly userId: string; readonly context?: ConsentContext | undefined },
): Promise<void> {
  const [prompt] = await db
    .insert(newsletterPrompts)
    .values({ userId: input.userId, dismissCount: 1 })
    .onConflictDoUpdate({
      target: newsletterPrompts.userId,
      set: {
        dismissCount: sql`${newsletterPrompts.dismissCount} + 1`,
        lastDismissedAt: new Date(),
      },
    })
    .returning();

  if (!prompt || prompt.dismissCount < MAX_DISMISSALS) return;

  // Never overwrite an existing row: `subscribed` and `unsubscribed` are
  // decisions the person made. `declined` only records that we stopped asking.
  const [existing] = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, input.userId))
    .limit(1);
  if (existing) return;

  const resolved = (await resolveOne(db, input.userId))?.trim().toLowerCase() ?? null;
  const [row] = await db
    .insert(newsletterSubscribers)
    .values({
      id: newId(),
      // Same synthetic fallback as `subscribeAsUser`: satisfies NOT NULL and
      // UNIQUE without inventing a plausible address.
      email: resolved ?? `user:${input.userId}`,
      userId: input.userId,
      status: "declined",
      // Minted even though nothing will ever mail this row: the column is NOT
      // NULL, and a row that later flips to `subscribed` needs it anyway.
      unsubscribeTokenHash: hashToken(newToken()),
      source: "dashboard_hinweis",
    })
    // An anonymous row already holds this address. It is a different consent
    // record and must not be touched; the prompt counter alone silences us.
    .onConflictDoNothing()
    .returning();

  if (row) {
    await recordConsent(db, {
      subscriberId: row.id,
      event: "declined",
      source: "dashboard_hinweis",
      ...(input.context ? { context: input.context } : {}),
    });
  }
}

/**
 * Whether an interrupting hint may be shown to this account.
 *
 * Any subscriber row at all means the question has been answered — dabei,
 * waiting on a confirmation, opted out, or declined. Only `/account` reopens
 * the subject (spec §3.4).
 *
 * The dismissal counter stays keyed to the id alone: it records what this
 * account clicked away, which is not something an anonymous row can carry.
 */
export async function shouldPrompt(db: Db, account: NewsletterAccount): Promise<boolean> {
  // Id *or* address (see `accountMatch`): a row created through a public form
  // after the account was verified carries only the address, and interrupting
  // its owner would be asking someone who has already answered.
  const [sub] = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(accountMatch(account))
    .limit(1);
  if (sub) return false;

  const [prompt] = await db
    .select()
    .from(newsletterPrompts)
    .where(eq(newsletterPrompts.userId, account.userId))
    .limit(1);
  if (!prompt) return true;
  if (prompt.dismissCount >= MAX_DISMISSALS) return false;
  return Date.now() - prompt.lastDismissedAt.getTime() >= PROMPT_INTERVAL_MS;
}
