/**
 * Fetch one post by slug for its shareable single page (spec requirement 4).
 *
 * The same visibility rule as the feed applies: if the viewer may not see the
 * post, we return `null` so the app renders a 404 — a "board only" post is
 * never revealed to an external visitor via its share link. A soft-deleted
 * post (spec 2026-07-26) is always treated as gone, for every caller
 * including moderation — there is no restore surface.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { posts } from "../schema";
import type { Post } from "../types";
import { canViewPost, type Viewer } from "../visibility";

import { rowToPost } from "./manage";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** Visibility-filtered fetch by slug. Returns null when the viewer may not see it. */
export async function getPostBySlug(db: Db, slug: string, viewer: Viewer): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), isNull(posts.deletedAt)))
    .limit(1);
  if (!rows[0]) return null;
  const post = rowToPost(rows[0]);
  return canViewPost(viewer, post) ? post : null;
}

/** Unfiltered (by visibility) fetch by id — for edit screens after the caller has authorized. */
export async function getPostById(db: Db, id: string): Promise<Post | null> {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), isNull(posts.deletedAt)))
    .limit(1);
  return rows[0] ? rowToPost(rows[0]) : null;
}
