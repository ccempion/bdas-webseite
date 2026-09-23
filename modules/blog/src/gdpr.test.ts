/**
 * Integration tests for this module's GDPR functions (exportForUser,
 * deleteContentByAuthor) against a real Postgres schema. Skips when
 * DATABASE_URL is unreachable, matching every other test file in this
 * module. No cross-module migrations needed — posts/comments/reports key by
 * plain user ids, no FK (matches index.test.ts's own note).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { plainTextToDoc } from "./content";
import { addComment } from "./services/comments";
import { deleteContentByAuthor, exportForUser } from "./services/gdpr";
import { createPost, deletePost } from "./services/manage";
import { dismissReport, listOpenReports, reportPost } from "./services/report";
import { type Viewer } from "./visibility";

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

const doc = (text: string) => plainTextToDoc(text);
const other: Viewer = { userId: "usr_other", isMember: true, isFederal: false };
const departing: Viewer = { userId: "usr_departing", isMember: true, isFederal: false };

describeIfDb("blog GDPR functions", () => {
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
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("exportForUser", () => {
    it("returns every post and comment authored by the user, regardless of moderation soft-delete", async () => {
      const p1 = await createPost(t.db, { title: "Erster", content: doc("a") }, "usr_departing");
      const p2 = await createPost(t.db, { title: "Zweiter", content: doc("b") }, "usr_departing");
      await deletePost(t.db, p2.id); // moderation soft-delete — still their data
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("c") }, "usr_other");
      const c1 = await addComment(t.db, otherPost.id, departing, "eigener Kommentar");
      await addComment(t.db, otherPost.id, other, "fremder Kommentar");

      const result = await exportForUser(t.db, "usr_departing");

      expect(result.posts.map((p) => p.id).sort()).toEqual([p1.id, p2.id].sort());
      expect(result.comments.map((c) => c.id)).toEqual([c1.id]);
    });

    it("returns empty arrays for a user with no posts or comments", async () => {
      const result = await exportForUser(t.db, "usr_nobody");
      expect(result).toEqual({ posts: [], comments: [] });
    });
  });

  describe("deleteContentByAuthor", () => {
    it("hard-deletes every post the user authored", async () => {
      const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_departing");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [row] = await t.client`select count(*)::int as n from posts where id = ${p.id}`;
      expect(row?.["n"]).toBe(0);
    });

    it("cascades away comments and reports from ANY author on the user's own deleted post", async () => {
      const p = await createPost(
        t.db,
        { title: "Wird gelöscht", content: doc("x") },
        "usr_departing",
      );
      await addComment(t.db, p.id, other, "fremder Kommentar auf meinem Post");
      await reportPost(t.db, p.id, "usr_flagger", "Meldung auf meinem Post");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [commentRow] =
        await t.client`select count(*)::int as n from post_comments where post_id = ${p.id}`;
      expect(commentRow?.["n"]).toBe(0);
      const [reportRow] =
        await t.client`select count(*)::int as n from post_reports where post_id = ${p.id}`;
      expect(reportRow?.["n"]).toBe(0);
    });

    it("removes the user's own comments and reports on OTHER, still-existing posts", async () => {
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("x") }, "usr_other");
      await addComment(t.db, otherPost.id, departing, "mein Kommentar");
      await reportPost(t.db, otherPost.id, "usr_departing", "meine Meldung");

      await deleteContentByAuthor(t.db, "usr_departing");

      const [commentRow] =
        await t.client`select count(*)::int as n from post_comments where author_id = 'usr_departing'`;
      expect(commentRow?.["n"]).toBe(0);
      const [reportRow] =
        await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_departing'`;
      expect(reportRow?.["n"]).toBe(0);
      // the post itself, authored by someone else, must survive
      const [postRow] =
        await t.client`select count(*)::int as n from posts where id = ${otherPost.id}`;
      expect(postRow?.["n"]).toBe(1);
    });

    it("never touches a post, comment, or report belonging to someone else", async () => {
      const otherPost = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_other");
      const otherComment = await addComment(t.db, otherPost.id, other, "bleibt auch");
      await reportPost(t.db, otherPost.id, "usr_flagger", "bleibt ebenfalls");

      await deleteContentByAuthor(t.db, "usr_departing"); // usr_departing has nothing at all here

      const [postRow] =
        await t.client`select count(*)::int as n from posts where id = ${otherPost.id}`;
      expect(postRow?.["n"]).toBe(1);
      const [commentRow] =
        await t.client`select count(*)::int as n from post_comments where id = ${otherComment.id}`;
      expect(commentRow?.["n"]).toBe(1);
      const [reportRow] =
        await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_flagger'`;
      expect(reportRow?.["n"]).toBe(1);
    });

    it("also removes already soft-deleted posts and dismissed reports the user owns", async () => {
      const p = await createPost(t.db, { title: "Schon weg", content: doc("x") }, "usr_departing");
      await deletePost(t.db, p.id); // moderation soft-delete first
      const otherPost = await createPost(t.db, { title: "Fremd", content: doc("x") }, "usr_other");
      await reportPost(t.db, otherPost.id, "usr_departing", "wird verworfen");
      const [report] = await listOpenReports(t.db);
      await dismissReport(t.db, report!.id);

      await deleteContentByAuthor(t.db, "usr_departing");

      const [postRow] = await t.client`select count(*)::int as n from posts where id = ${p.id}`;
      expect(postRow?.["n"]).toBe(0);
      const [reportRow] =
        await t.client`select count(*)::int as n from post_reports where reporter_id = 'usr_departing'`;
      expect(reportRow?.["n"]).toBe(0);
    });

    it("is idempotent: a second call after everything is gone is a clean no-op", async () => {
      const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_departing");
      await addComment(t.db, p.id, departing, "eigener Kommentar auf eigenem Post");

      await deleteContentByAuthor(t.db, "usr_departing");
      await expect(deleteContentByAuthor(t.db, "usr_departing")).resolves.toBeUndefined();
    });

    it("is a no-op for a user with no posts, comments, or reports", async () => {
      await expect(deleteContentByAuthor(t.db, "usr_nobody")).resolves.toBeUndefined();
    });

    it("rejects an empty userId without touching the database", async () => {
      await expect(deleteContentByAuthor(t.db, "")).rejects.toThrow();
    });
  });
});
