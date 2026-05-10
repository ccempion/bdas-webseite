import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Until the auth module ships (Sprint 1 module step), the auth pages are
 * scaffolded but must 404 in production. Local devs flip BDAS_FLAG_AUTH=true
 * to preview the UI shell.
 */
export function requireAuthFlag(): void {
  if (!isFlagOn("auth")) notFound();
}
