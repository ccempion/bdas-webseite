/** Gleiche Regel wie `normalizeSource` in @bdas/onboarding für `kampagne:<slug>`. */
export const CAMPAIGN_SLUG = /^[a-z0-9-]{1,64}$/;

export function buildEntryLink(siteUrl: string, slug: string): string | null {
  if (!CAMPAIGN_SLUG.test(slug)) return null;
  return `${siteUrl.replace(/\/$/, "")}/mitmachen?from=kampagne:${slug}`;
}
