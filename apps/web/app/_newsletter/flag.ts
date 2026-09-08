import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * On in Vercel previews so the branch is reviewable on its preview URL before
 * the production flag flips (same shape as `faqEnabled`). Set
 * BDAS_FLAG_NEWSLETTER=true to enable it anywhere.
 */
export function newsletterEnabled(): boolean {
  return isFlagOn("newsletter") || process.env["VERCEL_ENV"] === "preview";
}

/**
 * For newsletter-OWNED routes only (PR 3's /newsletter, confirm, unsubscribe).
 *
 * Never call this from a surface embedded in someone else's page: a 404 inside
 * /account would take a member's whole account page away over a switched-off
 * side feature. Those surfaces ask `newsletterEnabled()` and render null.
 */
export function requireNewsletterFlag(): void {
  if (!newsletterEnabled()) notFound();
}
