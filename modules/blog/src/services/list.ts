/**
 * The blog feed: posts the viewer may see, newest first (spec requirement 3),
 * optionally narrowed by category and/or a `since` cutoff (spec 2026-07-26).
 *
 * Visibility is enforced in SQL — `visibility IN (<levels the viewer may read>)`
 * OR `created_by = viewer.userId` (author-sees-own). An anonymous visitor only
 * ever gets `public` rows; this is the server-side guard, not a UI filter.
 * Soft-deleted posts (`deleted_at IS NOT NULL`) are always excluded.
 */
import { and, desc, eq, gte, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { posts } from "../schema";
import type { PostCategory, PostSummary } from "../types";
import { visibleLevelsFor, type Viewer } from "../visibility";

import { rowToPost } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type ListPostsFilters = {
  readonly category?: PostCategory;
  readonly since?: Date;
};

export async function listPosts(
  db: Db,
  viewer: Viewer,
  filters?: ListPostsFilters,
): Promise<PostSummary[]> {
  const levels = visibleLevelsFor(viewer);
  const visibleByLevel = inArray(posts.visibility, levels);
  const visibilityWhere: SQL =
    viewer.userId !== null
      ? (or(visibleByLevel, eq(posts.createdBy, viewer.userId)) as SQL)
      : visibleByLevel;

  const conditions: SQL[] = [visibilityWhere, isNull(posts.deletedAt)];
  if (filters?.category) conditions.push(eq(posts.category, filters.category));
  if (filters?.since) conditions.push(gte(posts.createdAt, filters.since));

  const rows = await db
    .select()
    .from(posts)
    .where(and(...conditions))
    .orderBy(desc(posts.createdAt));
  return rows.map(rowToPost);
}
