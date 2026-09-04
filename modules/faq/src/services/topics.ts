import { asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { faqTopics } from "../schema";
import { newId, type FaqTopic } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const MAX_NAME = 80;

function checkName(name: string): string {
  const n = name.trim();
  if (n.length === 0 || n.length > MAX_NAME) throw new ValidationError("Ungültiger Themenname.");
  return n;
}

export async function listTopics(db: Db): Promise<FaqTopic[]> {
  return db.select().from(faqTopics).orderBy(asc(faqTopics.position), asc(faqTopics.name));
}

export async function createTopic(db: Db, input: { name: string }): Promise<FaqTopic> {
  const name = checkName(input.name);
  const [row] = await db
    .insert(faqTopics)
    .values({
      id: newId(),
      name,
      position: sql`coalesce((select max(position) from faq_topics), -1) + 1`,
    })
    .returning();
  return row!;
}

export async function renameTopic(db: Db, input: { id: string; name: string }): Promise<FaqTopic> {
  const name = checkName(input.name);
  const [row] = await db
    .update(faqTopics)
    .set({ name })
    .where(eq(faqTopics.id, input.id))
    .returning();
  if (!row) throw new NotFoundError("Thema nicht gefunden.");
  return row;
}

export async function reorderTopics(
  db: Db,
  input: { orderedIds: readonly string[] },
): Promise<void> {
  for (const [i, id] of input.orderedIds.entries()) {
    await db.update(faqTopics).set({ position: i }).where(eq(faqTopics.id, id));
  }
}

export async function deleteTopic(db: Db, input: { id: string }): Promise<void> {
  await db.delete(faqTopics).where(eq(faqTopics.id, input.id));
}
