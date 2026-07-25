import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

export function requireProfileFlag(): void {
  if (!isFlagOn("profile")) notFound();
}
