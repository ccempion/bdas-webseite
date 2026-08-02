import { isFlagOn } from "@bdas/feature-flags";

/**
 * Whether the FAQ surface is available. Gated by the `faq` feature flag in
 * production, but always on in Vercel preview deployments (`VERCEL_ENV` is
 * "preview") so the branch can be reviewed on its preview URL before the flag
 * is switched on in production. Set BDAS_FLAG_FAQ=true to enable it anywhere.
 */
export function faqEnabled(): boolean {
  return isFlagOn("faq") || process.env["VERCEL_ENV"] === "preview";
}
