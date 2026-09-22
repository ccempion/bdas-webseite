import Link from "next/link";
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";
import {
  fillText,
  FLOW,
  getJourneyForUser,
  loadFlowEnv,
  nextStep,
  resolveTarget,
  textContext,
} from "@bdas/onboarding";

import { requireAuthFlag } from "../../_auth/flag";
import { buildAnmeldenUrl } from "../../_auth/return-to";
import { loadCurrentMember } from "../../_dashboard/session";
import { requireOnboardingFlag } from "../../_onboarding/flag";
import { Progress } from "../../_onboarding/ui/Progress";
import { waitingSentence } from "./sentence";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bewerbung abgeschickt" };

const STEP =
  "flex items-center gap-3 text-bdas-ink-body before:block before:h-2.5 before:w-2.5 before:rounded-bdas-full";

export default async function FertigPage() {
  requireAuthFlag();
  requireOnboardingFlag();

  const me = await loadCurrentMember();
  if (!me) redirect(buildAnmeldenUrl("/mitmachen/fertig"));

  const db = getDb();
  const journey = await getJourneyForUser(db, me.user.id);
  if (!journey) redirect("/mitmachen");

  // Offene Journeys mit der Lage von jetzt nachrechnen, wie /mitmachen/angaben
  // (Spec §6: gelöschte Gruppe); abgeschickte zeigen, wohin sie gingen.
  const env = await loadFlowEnv(db);
  const step = journey.status === "details_offen" ? nextStep(FLOW, journey.answers, env) : null;
  const outcome = FLOW.outcomes[step?.kind === "outcome" ? step.outcome : journey.outcome];
  const waiting =
    journey.status === "details_offen" &&
    resolveTarget(FLOW, outcome.target, journey.answers, env).kind === "unavailable";
  if (journey.status === "details_offen" && !waiting) redirect("/mitmachen/angaben");

  const ctx = textContext(FLOW, journey.answers, env);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Card flat className="flex flex-col gap-4 p-6">
        <Progress part={3} />
        {waiting ? (
          <>
            <h1 className="text-2xl font-semibold text-bdas-ink">
              Wir melden uns, sobald es losgeht.
            </h1>
            <p className="text-bdas-ink-body">
              Der Bereich für deine Organisation wird gerade eingerichtet. Deine Antworten sind
              gespeichert; wir schreiben dir, sobald du weitermachen kannst.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-bdas-ink">
              Deine Bewerbung liegt jetzt {fillText(outcome.submittedTo, ctx)}.
            </h1>
            <p className="text-bdas-ink-body">{waitingSentence(outcome)}</p>
            <ol aria-label="Nächste Schritte" className="flex flex-col gap-2">
              <li className={`${STEP} before:bg-bdas-ink`}>Beworben</li>
              <li className={`${STEP} before:border before:border-bdas-strong`}>
                {fillText(outcome.decider, ctx)} prüft
              </li>
              <li className={`${STEP} before:border before:border-bdas-strong`}>Aufgenommen</li>
            </ol>
          </>
        )}
      </Card>

      {!waiting && isFlagOn("events") ? (
        <Card className="p-6">
          <p className="font-semibold text-bdas-ink">Schon mal reinschauen?</p>
          <Link href="/events" className="text-bdas-red hover:underline">
            Schau dir die nächsten Events an
          </Link>
        </Card>
      ) : null}

      <p>
        <Link href="/" className="text-bdas-red hover:underline">
          Zur Startseite
        </Link>
      </p>
    </main>
  );
}
