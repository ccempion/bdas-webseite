/**
 * The blog feed: posts the viewer may see, newest first (spec requirement 3).
 *
 * Visibility is enforced in SQL — `visibility IN (<levels the viewer may read>)`
 * OR `created_by = viewer.userId` (author-sees-own). An anonymous visitor only
 * ever gets `public` rows; this is the server-side guard, not a UI filter.
 */
import { desc, eq, inArray, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { posts } from "../schema";
import type { PostSummary } from "../types";
import { visibleLevelsFor, type Viewer } from "../visibility";

import { rowToPost } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

export async function listPosts(db: Db, viewer: Viewer): Promise<PostSummary[]> {
  const levels = visibleLevelsFor(viewer);
  const visibleByLevel = inArray(posts.visibility, levels);
  const where: SQL | undefined =
    viewer.userId !== null
      ? or(visibleByLevel, eq(posts.createdBy, viewer.userId))
      : visibleByLevel;

  const rows = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt));
  return rows.map(rowToPost);
}
