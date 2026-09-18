import { requireFederalScope } from "../../../_dashboard/session";
import { CAMPAIGNS } from "../../../_onboarding/campaigns";
import { requireOnboardingFlag } from "../../../_onboarding/flag";
import { EntryLinkBuilder } from "./EntryLinkBuilder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstiegslinks" };

export default async function EinstiegslinksPage() {
  requireOnboardingFlag();
  await requireFederalScope();

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-bdas-ink">Einstiegslinks</h1>
        <p className="text-bdas-ink-body">
          Links in den Registrierungs-Wizard für Plakate, Flyer und Social Media. Wer über so einen
          Link kommt, wird mit der Kampagne gespeichert.
        </p>
      </header>
      <EntryLinkBuilder
        siteUrl={process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000"}
        campaigns={Object.entries(CAMPAIGNS).map(([slug, c]) => ({ slug, title: c.title }))}
      />
    </main>
  );
}
