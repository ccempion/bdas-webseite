import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ContentPageSaved } from "../events";
import { contentPages } from "../schema";
import { PuckDataSchema, type ContentActor, type ContentPage, type PageData } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const SLUG_RE = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const MAX_DATA_BYTES = 512 * 1024;

export async function getPage(db: Db, slug: string): Promise<ContentPage | null> {
  const rows = await db.select().from(contentPages).where(eq(contentPages.slug, slug)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { slug: row.slug, data: row.data as PageData, updatedAt: row.updatedAt };
}

export async function savePage(
  db: Db,
  input: { slug: string; data: unknown; actor: ContentActor },
): Promise<ContentPage> {
  if (!input.actor.grants.some((g) => g.role === "federal_board")) {
    throw new ForbiddenError("Nur der Bundesvorstand darf Seiten bearbeiten.");
  }
  if (!SLUG_RE.test(input.slug)) {
    throw new ValidationError("Ungültiger Seiten-Slug.");
  }
  const parsed = PuckDataSchema.safeParse(input.data);
  if (!parsed.success) {
    throw new ValidationError("Ungültiges Seitendokument.");
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_DATA_BYTES) {
    throw new ValidationError("Seitendokument zu groß (max. 512 KB).");
  }

  const now = new Date();
  await db
    .insert(contentPages)
    .values({ slug: input.slug, data: parsed.data, updatedAt: now, updatedBy: input.actor.userId })
    .onConflictDoUpdate({
      target: contentPages.slug,
      set: { data: parsed.data, updatedAt: now, updatedBy: input.actor.userId },
    });

  const event: ContentPageSaved = {
    type: "content.page.saved",
    slug: input.slug,
    updatedBy: input.actor.userId,
    at: now,
  };
  await getEventBus().publish(event);

  return { slug: input.slug, data: parsed.data, updatedAt: now };
}
