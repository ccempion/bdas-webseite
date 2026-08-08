/**
 * Member comments on a post (spec 2026-08-08, ADR 0033). Flat — comments never
 * reference each other — plain text, and visible only to members and alumni.
 *
 * Unlike `report.ts`, the write path takes a `Viewer` and applies `canViewPost`
 * here rather than trusting the caller: this is defence in depth for a write
 * path that will grow more callers over time. A post the viewer may not see
 * raises NotFoundError, never ForbiddenError — otherwise the error itself would
 * reveal that a "Nur Vorstände" post exists.
 */
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ForbiddenError, NotFoundError, RateLimitError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { CommentCreated } from "../events";
import { postComments, posts } from "../schema";
import type { Comment, PostVisibility } from "../types";
import { canModerateComment, canViewPost, type Viewer } from "../visibility";

export type Db = PostgresJsDatabase<Record<string, never>>;

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_MAX_PER_WINDOW = 20;
const BODY_MAX_LENGTH = 1000;

type Row = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: Date;
};

function rowToComment(r: Row): Comment {
  return {
    id: r.id,
    postId: r.postId,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt,
  };
}

async function assertNotRateLimited(db: Db, authorId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RATE_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postComments)
    .where(and(eq(postComments.authorId, authorId), gte(postComments.createdAt, cutoff)));
  if ((row?.n ?? 0) >= RATE_MAX_PER_WINDOW) {
    throw new RateLimitError("Zu viele Kommentare in kurzer Zeit. Bitte später erneut versuchen.");
  }
}

/**
 * Add a comment. The author is `viewer.userId` — deliberately not a separate
 * argument, so the two can never disagree.
 */
export async function addComment(
  db: Db,
  postId: string,
  viewer: Viewer,
  body: string,
): Promise<Comment> {
  const authorId = viewer.userId;
  if (authorId === null) throw new ForbiddenError("Anmeldung erforderlich.");

  const trimmed = body.trim();
  if (!trimmed) throw new ValidationError("Kommentar darf nicht leer sein.");
  if (trimmed.length > BODY_MAX_LENGTH) {
    throw new ValidationError("Kommentar darf höchstens 1000 Zeichen haben.");
  }

  const rows = await db
    .select({ visibility: posts.visibility, createdBy: posts.createdBy })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  const post = rows[0];
  if (!post) throw new NotFoundError("Beitrag nicht gefunden.");
  if (
    !canViewPost(viewer, {
      visibility: post.visibility as PostVisibility,
      createdBy: post.createdBy,
    })
  ) {
    throw new NotFoundError("Beitrag nicht gefunden.");
  }

  await assertNotRateLimited(db, authorId);

  const [inserted] = await db
    .insert(postComments)
    .values({ id: createId("cmnt"), postId, authorId, body: trimmed })
    .returning({
      id: postComments.id,
      postId: postComments.postId,
      authorId: postComments.authorId,
      body: postComments.body,
      createdAt: postComments.createdAt,
    });
  if (!inserted) throw new NotFoundError("Kommentar konnte nicht gespeichert werden.");

  const event: CommentCreated = {
    type: "blog.comment.created",
    postId,
    commentId: inserted.id,
    authorId,
    at: new Date(),
  };
  await getEventBus().publish(event);

  return rowToComment(inserted);
}

/**
 * Comments on a post, oldest first. Takes no `Viewer`: callers reach this only
 * after resolving the post through the visibility-gated `getPostBySlug`, and
 * soft-deleted posts are filtered here as a backstop.
 */
export async function listComments(db: Db, postId: string): Promise<Comment[]> {
  const rows = await db
    .select({
      id: postComments.id,
      postId: postComments.postId,
      authorId: postComments.authorId,
      body: postComments.body,
      createdAt: postComments.createdAt,
    })
    .from(postComments)
    .innerJoin(posts, eq(postComments.postId, posts.id))
    .where(
      and(eq(postComments.postId, postId), isNull(postComments.deletedAt), isNull(posts.deletedAt)),
    )
    .orderBy(asc(postComments.createdAt));
  return rows.map(rowToComment);
}

/** Soft-delete a comment. Its author, or the federal board. */
export async function deleteComment(db: Db, commentId: string, viewer: Viewer): Promise<void> {
  const rows = await db
    .select({ authorId: postComments.authorId })
    .from(postComments)
    .where(and(eq(postComments.id, commentId), isNull(postComments.deletedAt)))
    .limit(1);
  const comment = rows[0];
  if (!comment) throw new NotFoundError("Kommentar nicht gefunden.");
  if (!canModerateComment(viewer, comment)) {
    throw new ForbiddenError("Du darfst diesen Kommentar nicht löschen.");
  }

  await db
    .update(postComments)
    .set({ deletedAt: new Date() })
    .where(eq(postComments.id, commentId));
}

/**
 * Comment counts for a set of posts, for the feed. Posts with no comments are
 * absent from the map rather than present with 0 — callers use `?? 0`.
 */
export async function countCommentsByPost(
  db: Db,
  postIds: ReadonlyArray<string>,
): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();

  const rows = await db
    .select({ postId: postComments.postId, n: sql<number>`count(*)::int` })
    .from(postComments)
    .where(and(inArray(postComments.postId, [...postIds]), isNull(postComments.deletedAt)))
    .groupBy(postComments.postId);

  return new Map(rows.map((r) => [r.postId, r.n]));
}

/**
 * Erasure seam for account deletion (spec §5). A HARD delete, including
 * already soft-deleted rows: a comment body is personal data, so retaining it
 * would defeat the point. Returns the number of rows removed.
 *
 * Account deletion does not exist yet — this is the function it will call, so
 * that no other module ever touches `post_comments` directly (rule 1).
 */
export async function deleteCommentsByAuthor(db: Db, authorId: string): Promise<number> {
  const removed = await db
    .delete(postComments)
    .where(eq(postComments.authorId, authorId))
    .returning({ id: postComments.id });
  return removed.length;
}
