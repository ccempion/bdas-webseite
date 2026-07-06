import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/** Public-shell routes 404 while the flag is off (CLAUDE.md §3, rule 6). */
export function requirePublicShellFlag(): void {
  if (!isFlagOn("public_shell")) notFound();
}
