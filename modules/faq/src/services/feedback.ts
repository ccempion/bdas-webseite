import { inArray, sql } from "drizzle-orm";

import { NotFoundError } from "@bdas/errors";

import { faqFeedback } from "../schema";
import type { Db } from "./topics";

export type FeedbackCounts = { up: number; down: number };

/**
 * postgres-js puts the SQLSTATE in `code`; `23503` is foreign_key_violation —
 * the entry the vote points at does not exist.
 */
function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string };
  return e.code === "23503";
}

/**
 * One vote per member per entry, changeable: the composite primary key on
 * (entry_id, user_id) is what makes a second vote overwrite the first rather
 * than adding a row. Auth-agnostic — it stores whichever userId it is given;
 * the app layer is responsible for that being the caller's own id.
 */
export async function upsertFeedback(
  db: Db,
  input: { entryId: string; userId: string; helpful: boolean },
): Promise<void> {
  try {
    await db
      .insert(faqFeedback)
      .values({ entryId: input.entryId, userId: input.userId, helpful: input.helpful })
      .onConflictDoUpdate({
        target: [faqFeedback.entryId, faqFeedback.userId],
        set: { helpful: input.helpful, updatedAt: new Date() },
      });
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new NotFoundError("Eintrag nicht gefunden.");
    throw err;
  }
}

/**
 * Aggregate counts only — who voted never leaves the module. Every requested
 * id is present in the result, defaulting to {up: 0, down: 0} when nobody has
 * voted, so callers never need to null-check a lookup (matches `withCounts`
 * in modules/events/src/services/list.ts).
 */
export async function feedbackCounts(
  db: Db,
  entryIds: readonly string[],
): Promise<Map<string, FeedbackCounts>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select({
      entryId: faqFeedback.entryId,
      up: sql<number>`count(*) filter (where ${faqFeedback.helpful})`,
      down: sql<number>`count(*) filter (where not ${faqFeedback.helpful})`,
    })
    .from(faqFeedback)
    .where(inArray(faqFeedback.entryId, [...entryIds]))
    .groupBy(faqFeedback.entryId);
  const byId = new Map(rows.map((r) => [r.entryId, { up: Number(r.up), down: Number(r.down) }]));
  return new Map(entryIds.map((id) => [id, byId.get(id) ?? { up: 0, down: 0 }]));
}
