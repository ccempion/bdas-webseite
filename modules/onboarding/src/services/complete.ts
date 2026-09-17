import { and, eq } from "drizzle-orm";

import { ForbiddenError, NotFoundError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { changePrimaryGroup, getMember, type Actor } from "@bdas/members";

import type { Db } from "../env";
import type { OnboardingCompleted } from "../events";
import { FLOW } from "../flow";
import { nextStep } from "../next-step";
import { onboardingJourneys } from "../schema";
import { resolveTarget } from "../target";
import type { FlowEnv, Journey } from "../types";
import { getJourneyForUser, row2journey } from "./journeys";

export type CompleteResult =
  | { readonly kind: "submitted"; readonly journey: Journey }
  | { readonly kind: "waiting"; readonly journey: Journey };

/**
 * Schickt die Bewerbung ab (Spec §5.2, §5.3 Punkt 4).
 *
 * Die Journey kommt über `actor.userId`, das Ziel aus `resolveTarget` — keine
 * vom Aufrufer gelieferte Gruppen-ID erreicht `changePrimaryGroup`. Deshalb
 * darf dieser Weg den App-Guard `requireSelfServiceGroup` auslassen und an
 * `netzwerk`/`affiliate` beantragen (ADR 0048).
 *
 * Die Profilangaben speichert der Aufrufer vorher über `@bdas/profile`; dieses
 * Modul kennt das Profil nicht.
 */
export async function completeJourney(
  db: Db,
  input: { memberId: string; actor: Actor; env: FlowEnv },
): Promise<CompleteResult> {
  const member = await getMember(db, input.memberId);
  if (!member || member.userId !== input.actor.userId) {
    throw new ForbiddenError("Du kannst nur deine eigene Bewerbung abschicken.");
  }

  const journey = await getJourneyForUser(db, input.actor.userId);
  if (!journey) throw new NotFoundError("Einstieg nicht gefunden.");
  if (journey.status === "abgeschickt") return { kind: "submitted", journey };

  const step = nextStep(FLOW, journey.answers, input.env);
  if (step.kind !== "outcome") {
    throw new ValidationError("Bitte beantworte zuerst alle Fragen.");
  }
  const outcome = step.outcome;
  const target = resolveTarget(FLOW, FLOW.outcomes[outcome].target, journey.answers, input.env);

  if (target.kind === "unavailable") {
    const [row] = await db
      .update(onboardingJourneys)
      .set({ outcome, updatedAt: new Date() })
      .where(eq(onboardingJourneys.id, journey.id))
      .returning();
    if (!row) throw new Error("completeJourney: update returned no row");
    return { kind: "waiting", journey: row2journey(row) };
  }

  let applicationRef: string | null = null;
  if (target.kind === "group") {
    const result = await changePrimaryGroup(db, input.memberId, target.groupId, input.actor);
    applicationRef = result.kind === "requested" ? result.request.id : null;
  }

  const now = new Date();
  const [row] = await db
    .update(onboardingJourneys)
    .set({ status: "abgeschickt", outcome, applicationRef, updatedAt: now })
    .where(
      and(eq(onboardingJourneys.id, journey.id), eq(onboardingJourneys.status, "details_offen")),
    )
    .returning();

  if (!row) {
    // A concurrent submit won the race; its row is the answer.
    const winner = await getJourneyForUser(db, input.actor.userId);
    if (!winner) throw new NotFoundError("Einstieg nicht gefunden.");
    return { kind: "submitted", journey: winner };
  }

  const event: OnboardingCompleted = {
    type: "onboarding.completed",
    memberId: input.memberId,
    outcome,
    entrySource: row.entrySource,
    at: now,
  };
  await getEventBus().publish(event);

  return { kind: "submitted", journey: row2journey(row) };
}
