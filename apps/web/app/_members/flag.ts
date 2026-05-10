import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

export function requireMembersFlag(): void {
  if (!isFlagOn("members")) notFound();
}
