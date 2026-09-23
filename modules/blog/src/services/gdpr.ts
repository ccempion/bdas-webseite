/**
 * This module's GDPR self-service contributions (Art. 15 export, Art. 17
 * purge) for the account-deletion feature. `posts.created_by`,
 * `post_comments.author_id`, and `post_reports.reporter_id` are already
 * plain auth-user ids with no FK (see schema.ts) — unlike `files`/
 * `notifications`, this module needs no MemberIdResolver: it operates
 * directly on the identity the orchestrator holds, the same one
 * createPost/addComment/reportPost already take today.
 *
 * Own posts are hard-deleted (not soft-deleted like the moderation path in
 * manage.ts) — post_comments.post_id and post_reports.post_id are both
 * ON DELETE CASCADE, so removing the post row already removes every comment
 * and report on it, from any author, per design spec §2 decision 3 ("eigene
 * Beiträge samt deren Kommentaren, die kaskadieren"). The user's own
 * comments and reports left on OTHER, still-existing posts are removed
 * separately, via this module's existing erasure seams.
 */
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { postComments, posts } from "../schema";
import type { Comment, Post } from "../types";
import { deleteCommentsByAuthor, rowToComment } from "./comments";
import { rowToPost } from "./manage";
import { deleteReportsByReporter } from "./report";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type BlogExport = {
  readonly posts: readonly Post[];
  readonly comments: readonly Comment[];
};

/**
 * Art. 15 — this module's slice of a user's full data export: every post
 * they authored and every comment they wrote, regardless of moderation
 * soft-delete state (the row still exists, so it is still their data — a
 * hard delete, not this function, is what actually removes it).
 */
export async function exportForUser(db: Db, userId: string): Promise<BlogExport> {
  const postRows = await db.select().from(posts).where(eq(posts.createdBy, userId));
  const commentRows = await db.select().from(postComments).where(eq(postComments.authorId, userId));
  return {
    posts: postRows.map(rowToPost),
    comments: commentRows.map(rowToComment),
  };
}

/**
 * Art. 17 purge step, run by the account-deletion orchestrator (a later
 * PR). Hard-deletes every post this user authored — cascading its comments
 * and reports, from any author/reporter — then removes this user's own
 * comments and reports left on other, still-existing posts. No event is
 * published: this module's deletion sweep is a direct orchestrator call,
 * not an event-reactive side effect (design spec §2 decision 1), and
 * nothing subscribes to blog.post.deleted today.
 *
 * The three DELETEs below are not wrapped in a transaction: each is
 * independently safe to re-run (a retry after a partial failure just finds
 * fewer or no matching rows to delete), so the account-deletion
 * orchestrator's own per-step retry design already covers this — no
 * transaction is needed.
 *
 * Known gap (parked, not fixed here): this function does not delete inline
 * post images uploaded to the blog-media storage bucket
 * (`getBlogMediaStorage()` from `@bdas/storage`, see
 * `apps/web/app/api/blog/upload-url/route.ts`) — those objects remain
 * publicly reachable after the post row is gone. This must be resolved
 * (the shared `core/storage` `StorageClient` interface needs bulk/prefix
 * delete added — today it only exposes single-key `deleteObject`) before
 * this function is wired into a live deletion sweep.
 */
export async function deleteContentByAuthor(db: Db, userId: string): Promise<void> {
  if (!userId) {
    throw new Error("deleteContentByAuthor requires a non-empty userId");
  }
  await db.delete(posts).where(eq(posts.createdBy, userId));
  await deleteCommentsByAuthor(db, userId);
  await deleteReportsByReporter(db, userId);
}
