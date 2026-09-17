import { and, eq } from "drizzle-orm";

import { ConflictError, NotFoundError, ValidationError } from "@bdas/errors";
import { createId } from "@bdas/id";

import { placeOf, sanitizeAnswers } from "../answers";
import { normalizeSource } from "../entry-context";
import type { Db } from "../env";
import { FLOW } from "../flow";
import { nextStep } from "../next-step";
import { onboardingJourneys, type JourneyRow } from "../schema";
import type { FlowEnv, Journey, JourneyStatus, OutcomeId } from "../types";

export const MAX_JSON_BYTES = 16 * 1024;

const tooBig = (value: unknown): boolean =>
  Buffer.byteLength(JSON.stringify(value ?? null), "utf8") > MAX_JSON_BYTES;

export function row2journey(row: JourneyRow): Journey {
  return {
    id: row.id,
    userId: row.userId,
    flowVersion: row.flowVersion,
    answers: row.answers,
    details: row.details,
    entrySource: row.entrySource,
    outcome: row.outcome as OutcomeId,
    stadt: row.stadt,
    status: row.status as JourneyStatus,
    applicationRef: row.applicationRef,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getJourneyForUser(db: Db, userId: string): Promise<Journey | null> {
  const rows = await db
    .select()
    .from(onboardingJourneys)
    .where(eq(onboardingJourneys.userId, userId))
    .limit(1);
  return rows[0] ? row2journey(rows[0]) : null;
}

/**
 * Legt die Journey bei der Registrierung an (Spec §5.3 Punkt 2). Das Ergebnis
 * rechnet der Server selbst aus; was der Browser sonst mitschickt, fällt in
 * `sanitizeAnswers` heraus. Eine noch nicht abgeschickte Journey wird
 * überschrieben — so beginnt der Weg nach einem Fehlschlag neu.
 */
export async function startJourney(
  db: Db,
  input: { userId: string; answers: unknown; entrySource: unknown; env: FlowEnv },
): Promise<Journey> {
  if (tooBig(input.answers)) throw new ValidationError("Eingabe zu groß.");
  const answers = sanitizeAnswers(FLOW, input.answers);
  const step = nextStep(FLOW, answers, input.env);
  if (step.kind !== "outcome") {
    throw new ValidationError("Bitte beantworte zuerst alle Fragen.");
  }

  const existing = await getJourneyForUser(db, input.userId);
  if (existing?.status === "abgeschickt") {
    throw new ConflictError("Deine Bewerbung ist bereits abgeschickt.");
  }

  const now = new Date();
  const values = {
    flowVersion: FLOW.version,
    answers,
    details: {},
    entrySource: normalizeSource(input.entrySource),
    outcome: step.outcome,
    stadt: placeOf(FLOW, answers, input.env).city,
    status: "details_offen" as const,
    applicationRef: null,
    updatedAt: now,
  };

  const [row] = await db
    .insert(onboardingJourneys)
    .values({ id: createId("onb"), userId: input.userId, createdAt: now, ...values })
    .onConflictDoUpdate({ target: onboardingJourneys.userId, set: values })
    .returning();
  if (!row) throw new Error("startJourney: upsert returned no row");
  return row2journey(row);
}

/** Zwischenstand von Teil 3 — überlebt ein geschlossenes Fenster und einen Gerätewechsel. */
export async function saveDetails(
  db: Db,
  input: { userId: string; details: unknown },
): Promise<Journey> {
  const d = input.details;
  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    throw new ValidationError("Angaben ungültig.");
  }
  if (tooBig(d)) throw new ValidationError("Eingabe zu groß.");

  const [row] = await db
    .update(onboardingJourneys)
    .set({ details: d as Record<string, unknown>, updatedAt: new Date() })
    .where(
      and(
        eq(onboardingJourneys.userId, input.userId),
        eq(onboardingJourneys.status, "details_offen"),
      ),
    )
    .returning();
  if (row) return row2journey(row);

  const existing = await getJourneyForUser(db, input.userId);
  if (!existing) throw new NotFoundError("Einstieg nicht gefunden.");
  throw new ConflictError("Deine Bewerbung ist bereits abgeschickt.");
}
