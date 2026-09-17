import { inArray } from "drizzle-orm";

import type { Db } from "../env";
import { onboardingJourneys } from "../schema";
import type { ApplicationIntent, JourneyStatus, OutcomeId } from "../types";

/**
 * Was jemand beim Einstieg gewählt hat — für „bewirbt sich als Alumnus/Alumna"
 * auf der Seite „Ohne Gruppe" (Spec §5.2). Eine Abfrage für die ganze Liste;
 * die Seite liest die Tabelle nie selbst.
 */
export async function getApplicationIntents(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, ApplicationIntent>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: onboardingJourneys.userId,
      outcome: onboardingJourneys.outcome,
      status: onboardingJourneys.status,
    })
    .from(onboardingJourneys)
    .where(inArray(onboardingJourneys.userId, [...userIds]));
  return new Map(
    rows.map((r) => [
      r.userId,
      { outcome: r.outcome as OutcomeId, status: r.status as JourneyStatus },
    ]),
  );
}
