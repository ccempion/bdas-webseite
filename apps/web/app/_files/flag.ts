import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * File routes (member and board) are flag-gated until the files module is
 * acceptance-complete (rule 6). The whole surface flips atomically on
 * BDAS_FLAG_FILES=true. Mirrors requireEventsFlag.
 */
export function requireFilesFlag(): void {
  if (!isFlagOn("files")) notFound();
}
