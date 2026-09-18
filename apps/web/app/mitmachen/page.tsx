import { redirect } from "next/navigation";

import { requireAuthFlag } from "../_auth/flag";
import { onboardingEnabled } from "../_onboarding/flag";
import { loadMitmachen } from "../_onboarding/load";
import { WizardPage } from "../_onboarding/WizardPage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mitglied werden" };

export default async function MitmachenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Route-Gate (CLAUDE.md §1 Regel 6). Ohne Flag bleibt /mitmachen, was es seit
  // der WordPress-Zeit war: eine Weiterleitung zur Registrierung.
  if (!onboardingEnabled()) redirect("/registrieren");
  requireAuthFlag();
  const view = await loadMitmachen(searchParams?.["from"]);
  if (view.kind === "redirect") redirect(view.to);
  return <WizardPage {...view.props} />;
}
