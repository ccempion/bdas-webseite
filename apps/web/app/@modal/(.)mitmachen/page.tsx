import { redirect } from "next/navigation";

import { requireAuthFlag } from "../../_auth/flag";
import { loadViewer } from "../../_dashboard/session";
import { onboardingEnabled } from "../../_onboarding/flag";
import { loadWizardProps } from "../../_onboarding/load";
import { WizardModal } from "../../_onboarding/WizardModal";

export const dynamic = "force-dynamic";

/** Fängt die Navigation nach /mitmachen ab und zeigt den Wizard als Fenster (Spec §5.5). */
export default async function MitmachenModal({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Route-Gate (CLAUDE.md §1 Regel 6). Ohne Flag bleibt /mitmachen, was es seit
  // der WordPress-Zeit war: eine Weiterleitung zur Registrierung.
  if (!onboardingEnabled()) redirect("/registrieren");
  requireAuthFlag();
  if (await loadViewer()) redirect("/account");
  return <WizardModal {...await loadWizardProps(searchParams?.["from"])} />;
}
