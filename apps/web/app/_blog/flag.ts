import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Blog routes are flag-gated until the module is acceptance-complete (rule 6).
 * Flip BDAS_FLAG_BLOG=true to preview.
 */
export function requireBlogFlag(): void {
  if (!isFlagOn("blog")) notFound();
}
