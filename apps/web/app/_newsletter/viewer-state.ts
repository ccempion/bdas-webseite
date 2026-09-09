import type { Db } from "@bdas/db";
import { getSubscriptionForUser, shouldPrompt } from "@bdas/newsletter";

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
 * Takes the already-resolved viewer rather than a session cookie: this runs on
 * every content page, and `loadViewer()` is `cache()`d per request, so passing
 * its result costs no second session read. A signed-out visitor costs no query
 * at all.
 */
export async function readNewsletterViewerState(
  db: Db,
  viewer: { readonly id: string } | null,
): Promise<NewsletterViewerState> {
  if (!newsletterEnabled()) return "off";
  if (!viewer) return "guest";

  const subscription = await getSubscriptionForUser(db, viewer.id);
  return subscription ? "done" : "member";
}

/**
 * Whether the scroll panel may appear at all, and as which offer — `null`
 * means never on this request.
 *
 * A stricter gate than {@link readNewsletterViewerState}, and deliberately so:
 * an inline block sits in the page and waits to be read, the panel slides in
 * over it. For an account that means the full §6.1 memory — a fortnight of
 * quiet after "Später", and silence for good after the third one. Both live in
 * `shouldPrompt`.
 *
 * A guest has no server-side memory to consult; theirs is the session marker
 * the panel reads in the browser.
 */
export async function readScrollPanelState(
  db: Db,
  viewer: { readonly id: string } | null,
): Promise<"guest" | "member" | null> {
  if (!newsletterEnabled()) return null;
  if (!viewer) return "guest";
  return (await shouldPrompt(db, viewer.id)) ? "member" : null;
}
