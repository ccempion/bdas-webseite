import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { FLOW, getJourneyForUser, loadFlowEnv, nextStep, resolveTarget } from "@bdas/onboarding";

import { requireAuthFlag } from "../../_auth/flag";
import { buildAnmeldenUrl } from "../../_auth/return-to";
import { loadCurrentMember } from "../../_dashboard/session";
import { AngabenWizard } from "../../_onboarding/AngabenWizard";
import { restoreDetails } from "../../_onboarding/details";
import { requireOnboardingFlag } from "../../_onboarding/flag";
import { requireProfileFlag } from "../../_profile/flag";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deine Angaben" };

export default async function AngabenPage() {
  requireAuthFlag();
  requireProfileFlag();
  requireOnboardingFlag();

  const me = await loadCurrentMember();
  if (!me) redirect(buildAnmeldenUrl("/mitmachen/angaben"));
  if (!me.member) redirect("/account");

  const db = getDb();
  const journey = await getJourneyForUser(db, me.user.id);
  if (!journey) redirect("/mitmachen");
  if (journey.status === "abgeschickt") redirect("/mitmachen/fertig");

  // Mit der Lage von jetzt nachrechnen (Spec §6: gelöschte Gruppe).
  const env = await loadFlowEnv(db);
  const step = nextStep(FLOW, journey.answers, env);
  const outcomeId = step.kind === "outcome" ? step.outcome : journey.outcome;
  const outcome = FLOW.outcomes[outcomeId];
  if (resolveTarget(FLOW, outcome.target, journey.answers, env).kind === "unavailable") {
    redirect("/mitmachen/fertig");
  }

  const notice =
    outcomeId !== journey.outcome
      ? "Die Gruppe, die du gewählt hattest, gibt es nicht mehr. Deine Bewerbung geht deshalb an den Bundesvorstand."
      : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-bdas-ink">Deine Angaben</h1>
      <Card flat className="p-6">
        <AngabenWizard
          userType={outcome.userType}
          firstName={me.member.firstName}
          initial={restoreDetails(journey.details)}
          notice={notice}
        />
      </Card>
    </main>
  );
}
