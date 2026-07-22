import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Project routes are flag-gated until the projects module is acceptance-complete
 * (rule 6). Flip BDAS_FLAG_PROJECTS=true to preview. The /projekte pages land in
 * a follow-up PR and will call this guard.
 */
export function requireProjectsFlag(): void {
  if (!isFlagOn("projects")) notFound();
}
