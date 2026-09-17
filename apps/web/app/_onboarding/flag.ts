import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

export function onboardingEnabled(): boolean {
  return isFlagOn("onboarding");
}

/** Route-Gate (CLAUDE.md §1 Regel 6). */
export function requireOnboardingFlag(): void {
  if (!onboardingEnabled()) notFound();
}

/** Wohin „Mitglied werden" führt. Ohne Flag bleibt alles wie heute. */
export function joinHref(): "/mitmachen" | "/registrieren" {
  return onboardingEnabled() ? "/mitmachen" : "/registrieren";
}
