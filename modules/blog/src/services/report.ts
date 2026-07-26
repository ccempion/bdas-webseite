/**
 * Member-reporting flow (spec 2026-07-26): any signed-in member who can view
 * a post — except its author — may report it. Reports feed a federal-board
 * moderation queue (`listOpenReports`) and a notification (see
 * `@bdas/notifications` subscriber). No pre-publish moderation is implied —
 * this is a post-publish signal, same as the existing author/board delete.
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError, RateLimitError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";
import { createId } from "@bdas/id";

import type { PostReported } from "../events";
import { postReports, posts } from "../schema";
import type { PostReport, PostReportStatus } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPORT_MAX_PER_WINDOW = 10;
const REASON_MAX_LENGTH = 300;

async function assertNotRateLimited(db: Db, reporterId: string): Promise<void> {
  const cutoff = new Date(Date.now() - REPORT_WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(postReports)
    .where(and(eq(postReports.reporterId, reporterId), gte(postReports.createdAt, cutoff)));
  if ((row?.n ?? 0) >= REPORT_MAX_PER_WINDOW) {
    throw new RateLimitError("Zu viele Meldungen in kurzer Zeit. Bitte später erneut versuchen.");
  }
}

/** Report a post for moderation review. Rejects self-reports; rate-limited per reporter. */
export async function reportPost(
  db: Db,
  postId: string,
  reporterId: string,
  reason: string | null,
): Promise<void> {
  const rows = await db
    .select({ createdBy: posts.createdBy })
    .from(posts)
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)))
    .limit(1);
  const post = rows[0];
  if (!post) throw new NotFoundError("Beitrag nicht gefunden.");
  if (post.createdBy === reporterId) {
    throw new ValidationError("Du kannst deinen eigenen Beitrag nicht melden.");
  }

  const trimmedReason = reason?.trim() || null;
  if (trimmedReason && trimmedReason.length > REASON_MAX_LENGTH) {
    throw new ValidationError("Begründung darf höchstens 300 Zeichen haben.");
  }

  await assertNotRateLimited(db, reporterId);

  await db.insert(postReports).values({
    id: createId("rprt"),
    postId,
    reporterId,
    reason: trimmedReason,
    status: "open",
  });

  const event: PostReported = {
    type: "blog.post.reported",
    postId,
    reporterId,
    reason: trimmedReason,
    at: new Date(),
  };
  await getEventBus().publish(event);
}

/** Open reports for the moderation queue, newest first, joined to post title/slug. */
export async function listOpenReports(db: Db): Promise<PostReport[]> {
  const rows = await db
    .select({
      id: postReports.id,
      postId: postReports.postId,
      postTitle: posts.title,
      postSlug: posts.slug,
      reporterId: postReports.reporterId,
      reason: postReports.reason,
      status: postReports.status,
      createdAt: postReports.createdAt,
    })
    .from(postReports)
    .innerJoin(posts, eq(postReports.postId, posts.id))
    .where(and(eq(postReports.status, "open"), isNull(posts.deletedAt)))
    .orderBy(desc(postReports.createdAt));

  return rows.map((r) => ({ ...r, status: r.status as PostReportStatus }));
}

/** Mark a report as dismissed (reviewed, no action taken). */
export async function dismissReport(db: Db, reportId: string): Promise<void> {
  const result = await db
    .update(postReports)
    .set({ status: "dismissed" })
    .where(eq(postReports.id, reportId))
    .returning({ id: postReports.id });
  if (!result[0]) throw new NotFoundError("Meldung nicht gefunden.");
}
