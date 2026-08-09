/**
 * Comment integration tests against a real Postgres schema (spec 2026-08-08).
 * Mirrors index.test.ts: skips when DATABASE_URL is unreachable; CI brings up
 * a Postgres service.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { BlogEvent } from "./events";
import { plainTextToDoc } from "./content";
import { createPost, deletePost } from "./services/manage";
import {
  addComment,
  countCommentsByPost,
  deleteComment,
  deleteCommentsByAuthor,
  listComments,
} from "./services/comments";
import { ANON, type Viewer } from "./visibility";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const author: Viewer = { userId: "usr_a", isMember: true, isFederal: false };
const member: Viewer = { userId: "usr_m", isMember: true, isFederal: false };
const federal: Viewer = { userId: "usr_f", isMember: true, isFederal: true };

describeIfDb("blog comments", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      "0001_init.sql",
      "0002_categories_reports_softdelete.sql",
      "0003_comments.sql",
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", "migrations", file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** A public post authored by usr_a. */
  async function aPost(visibility: "public" | "members" | "board" = "public") {
    return createPost(
      t.db,
      { title: "Nowruz-Fest", content: plainTextToDoc("Wir feiern."), visibility },
      "usr_a",
    );
  }

  it("addComment stores the comment and returns it", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "  Schöner Beitrag.  ");

    expect(c.id).toMatch(/^cmnt_/);
    expect(c.postId).toBe(p.id);
    expect(c.authorId).toBe("usr_m");
    expect(c.body).toBe("Schöner Beitrag.");
    expect(c.createdAt).toBeInstanceOf(Date);
  });

  it("addComment emits blog.comment.created once", async () => {
    const seen: BlogEvent[] = [];
    getEventBus().subscribe<BlogEvent>("blog.comment.created", (e) => {
      seen.push(e);
    });

    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Danke!");

    expect(seen).toMatchObject([
      { type: "blog.comment.created", postId: p.id, commentId: c.id, authorId: "usr_m" },
    ]);
  });

  it("addComment rejects an anonymous viewer with FORBIDDEN", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, ANON, "Hallo")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("addComment rejects an empty or whitespace-only body with VALIDATION", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, member, "   ")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("addComment rejects a body over 1000 characters with VALIDATION", async () => {
    const p = await aPost();
    await expect(addComment(t.db, p.id, member, "x".repeat(1001))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("addComment accepts a body of exactly 1000 characters", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "x".repeat(1000));
    expect(c.body).toHaveLength(1000);
  });

  it("addComment 404s on a missing post", async () => {
    await expect(addComment(t.db, "post_nope", member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment 404s on a soft-deleted post", async () => {
    const p = await aPost();
    await deletePost(t.db, p.id);
    await expect(addComment(t.db, p.id, member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment 404s a board-only post for a plain member, without revealing it", async () => {
    const p = await aPost("board");
    await expect(addComment(t.db, p.id, member, "Hallo")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("addComment allows the federal board on a board-only post", async () => {
    const p = await aPost("board");
    const c = await addComment(t.db, p.id, federal, "Gesehen.");
    expect(c.authorId).toBe("usr_f");
  });

  it("addComment trips the rate limit at the 21st comment in the window", async () => {
    const p = await aPost();
    for (let i = 0; i < 20; i++) {
      await addComment(t.db, p.id, member, `Kommentar ${i}`);
    }
    await expect(addComment(t.db, p.id, member, "einer zu viel")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("listComments returns oldest first and excludes deleted", async () => {
    const p = await aPost();
    const first = await addComment(t.db, p.id, member, "Erster");
    const second = await addComment(t.db, p.id, author, "Zweiter");
    const third = await addComment(t.db, p.id, federal, "Dritter");

    await deleteComment(t.db, second.id, author);

    const list = await listComments(t.db, p.id);
    expect(list.map((c) => c.id)).toEqual([first.id, third.id]);
  });

  it("listComments returns an empty list for a post with no comments", async () => {
    const p = await aPost();
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment lets the comment author delete their own", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg damit");
    await deleteComment(t.db, c.id, member);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment lets the federal board delete anyone's", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg damit");
    await deleteComment(t.db, c.id, federal);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });

  it("deleteComment returns the deleted comment's postId", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg damit");
    const returnedPostId = await deleteComment(t.db, c.id, member);
    expect(returnedPostId).toBe(p.id);
  });

  it("deleteComment rejects the post's author, who is not the comment's author", async () => {
    // `author` wrote the post but not the comment. ADR 0033: a post author may
    // not silence commenters on their own post. This is also the general
    // "some other member" case — usr_a has no special standing here.
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Kritik");
    await expect(deleteComment(t.db, c.id, author)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listComments(t.db, p.id)).toHaveLength(1);
  });

  it("deleteComment 404s an unknown or already-deleted comment", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "Weg");
    await deleteComment(t.db, c.id, member);

    await expect(deleteComment(t.db, c.id, member)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteComment(t.db, "cmnt_nope", member)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("countCommentsByPost counts per post, excluding deleted, omitting zero-comment posts", async () => {
    const p1 = await aPost();
    const p2 = await aPost();
    const p3 = await aPost();

    await addComment(t.db, p1.id, member, "eins");
    await addComment(t.db, p1.id, federal, "zwei");
    const gone = await addComment(t.db, p2.id, member, "drei");
    await deleteComment(t.db, gone.id, member);

    const counts = await countCommentsByPost(t.db, [p1.id, p2.id, p3.id]);
    expect(counts.get(p1.id)).toBe(2);
    expect(counts.get(p2.id)).toBeUndefined();
    expect(counts.get(p3.id)).toBeUndefined();
  });

  it("countCommentsByPost returns an empty map for an empty id list", async () => {
    expect(await countCommentsByPost(t.db, [])).toEqual(new Map());
  });

  it("deleteCommentsByAuthor hard-deletes every comment by that author", async () => {
    const p = await aPost();
    await addComment(t.db, p.id, member, "eins");
    await addComment(t.db, p.id, member, "zwei");
    await addComment(t.db, p.id, federal, "bleibt");

    const removed = await deleteCommentsByAuthor(t.db, "usr_m");
    expect(removed).toBe(2);

    const list = await listComments(t.db, p.id);
    expect(list.map((c) => c.authorId)).toEqual(["usr_f"]);

    // Hard delete: the rows are gone, not soft-deleted.
    const [row] = await t.client`
      select count(*)::int as n from post_comments where author_id = 'usr_m'
    `;
    expect(row?.["n"]).toBe(0);
  });

  it("deleteCommentsByAuthor also removes already soft-deleted comments", async () => {
    const p = await aPost();
    const c = await addComment(t.db, p.id, member, "weg");
    await deleteComment(t.db, c.id, member);

    expect(await deleteCommentsByAuthor(t.db, "usr_m")).toBe(1);
  });

  it("deleting a post cascades its comments away", async () => {
    const p = await aPost();
    await addComment(t.db, p.id, member, "eins");

    // deletePost is a SOFT delete, so the rows survive but must not be listed.
    await deletePost(t.db, p.id);
    expect(await listComments(t.db, p.id)).toEqual([]);
  });
});
