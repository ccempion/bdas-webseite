/**
 * Slugs give each post a stable, shareable URL (`/blog/[slug]`). We derive a
 * readable base from the title and append a short random suffix so titles can
 * repeat without colliding — the DB's UNIQUE(slug) is the final guard.
 */
import { createId } from "@bdas/id";

const MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/** Lowercase, transliterate German umlauts, keep [a-z0-9-], collapse dashes. */
export function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip remaining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "beitrag";
}

/** Build a unique slug: readable base + 6-char random alphanumeric suffix. */
export function buildSlug(title: string): string {
  // createId("bp") → "bp_<nanoid>"; the nanoid alphabet includes _ and -, so
  // drop the prefix and strip non-alphanumerics before taking a short suffix.
  const suffix = createId("bp", 32)
    .split("_")[1]!
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  return `${slugifyTitle(title)}-${suffix}`;
}
