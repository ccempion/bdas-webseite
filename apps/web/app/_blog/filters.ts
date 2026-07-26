/**
 * Server-driven blog feed filtering (spec 2026-07-26) — URL search params in,
 * `<Link>` hrefs out, mirroring apps/web/app/events/event-filter.ts exactly
 * (shareable URLs, no client JS).
 */
import { CATEGORY_LABELS, type PostCategory } from "@bdas/blog";

export type CategoryChip = { readonly key: PostCategory; readonly label: string };

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as PostCategory[];

export const CATEGORY_CHIPS: ReadonlyArray<CategoryChip> = CATEGORY_KEYS.map((key) => ({
  key,
  label: CATEGORY_LABELS[key],
}));

export type SinceKey = "7d" | "30d" | "jahr";

const SINCE_LABEL: Record<SinceKey, string> = {
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  jahr: "Dieses Jahr",
};

export const SINCE_OPTIONS: ReadonlyArray<{ readonly key: SinceKey; readonly label: string }> = (
  Object.keys(SINCE_LABEL) as SinceKey[]
).map((key) => ({ key, label: SINCE_LABEL[key] }));

/** Resolve a `zeitraum` URL value to a cutoff Date, or undefined for "alle". */
export function resolveSince(zeitraum: SinceKey | undefined): Date | undefined {
  const now = Date.now();
  switch (zeitraum) {
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case "jahr":
      return new Date(new Date().getFullYear(), 0, 1);
    default:
      return undefined;
  }
}

/** Build the /blog href for a given category + time selection. */
export function buildBlogHref(
  category: PostCategory | undefined,
  zeitraum: SinceKey | undefined,
): string {
  const params = new URLSearchParams();
  if (category) params.set("kategorie", category);
  if (zeitraum) params.set("zeitraum", zeitraum);
  const q = params.toString();
  return q ? `/blog?${q}` : "/blog";
}

/** Parse the `kategorie` search param into a valid PostCategory, or undefined. */
export function parseCategory(value: string | undefined): PostCategory | undefined {
  return value && (CATEGORY_KEYS as string[]).includes(value) ? (value as PostCategory) : undefined;
}

/** Parse the `zeitraum` search param into a valid SinceKey, or undefined. */
export function parseZeitraum(value: string | undefined): SinceKey | undefined {
  return value === "7d" || value === "30d" || value === "jahr" ? value : undefined;
}
