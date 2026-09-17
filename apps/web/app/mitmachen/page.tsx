import { redirect } from "next/navigation";

import { requireAuthFlag } from "../_auth/flag";
import { loadViewer } from "../_dashboard/session";
import { onboardingEnabled } from "../_onboarding/flag";
import { loadWizardProps } from "../_onboarding/load";
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
  // Eingeloggt gibt es nichts zu registrieren. PR 4 ersetzt das durch den Stand der Bewerbung.
  if (await loadViewer()) redirect("/account");
  return <WizardPage {...await loadWizardProps(searchParams?.["from"])} />;
}
