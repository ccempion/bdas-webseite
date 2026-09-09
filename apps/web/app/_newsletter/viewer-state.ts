import { getCurrentUser } from "@bdas/auth";
import type { Db } from "@bdas/db";
import { getSubscriptionForUser } from "@bdas/newsletter";

import { newsletterEnabled } from "./flag";

/**
 * What a newsletter surface should offer this visitor (spec §6).
 *
 * `done` is deliberately one state rather than four: subscribed, pending,
 * unsubscribed and declined all mean the same thing to a surface — the person
 * has answered, and only /account reopens the subject (§3.4).
 */
export type NewsletterViewerState = "guest" | "member" | "done" | "off";

/**
 * The single server-side read behind every inline surface. Kept apart from
 * `NewsletterOffer` on purpose: the Puck canvas is a client tree with no
 * server context, so a component that read this itself could not be placed
 * there. The host page reads, the component renders.
 *
 * A signed-out visitor costs no query — there is nothing to look up, and the
 * footer form is on every page anyway.
 */
export async function readNewsletterViewerState(
  db: Db,
  sessionCookie: string | undefined,
): Promise<NewsletterViewerState> {
  if (!newsletterEnabled()) return "off";
  if (!sessionCookie) return "guest";

  const user = await getCurrentUser(db, sessionCookie);
  if (!user) return "guest";

  const subscription = await getSubscriptionForUser(db, user.id);
  return subscription ? "done" : "member";
}
