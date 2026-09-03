import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/** Public-shell routes 404 while the flag is off (CLAUDE.md §3, rule 6). */
export function requirePublicShellFlag(): void {
  if (!isFlagOn("public_shell")) notFound();
}

/**
 * Podcast embed rides an existing public-shell page but ships behind its own
 * flag. Unlike `requirePublicShellFlag`, this returns a boolean — the page
 * still renders fine with the embed region absent.
 */
export function podcastEnabled(): boolean {
  return isFlagOn("public_shell") && isFlagOn("podcast");
}
