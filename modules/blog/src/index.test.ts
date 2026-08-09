/**
 * Blog integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * The blog table has no cross-module FKs (created_by is a plain user id), so
 * only the blog migration is applied.
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
import { getPostById, getPostBySlug } from "./services/get";
import { listPosts } from "./services/list";
import { createPost, deletePost, updatePost } from "./services/manage";
import { countOpenReports, dismissReport, listOpenReports, reportPost } from "./services/report";
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

const member: Viewer = { userId: "usr_m", isMember: true, isFederal: false };
const federal: Viewer = { userId: "usr_f", isMember: true, isFederal: true };

const doc = (text: string) => plainTextToDoc(text);

describeIfDb("blog integration", () => {
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

  function capture(type: BlogEvent["type"]): BlogEvent[] {
    const out: BlogEvent[] = [];
    getEventBus().subscribe<BlogEvent>(type, (e) => {
      out.push(e);
    });
    return out;
  }

  it("createPost inserts, defaults visibility public, mints a slug, and emits", async () => {
    const published = capture("blog.post.published");
    const p = await createPost(
      t.db,
      { title: "Nowruz-Fest", content: doc("Wir feiern Nowruz.") },
      "usr_m",
    );

    expect(p.id).toMatch(/^post_/);
    expect(p.visibility).toBe("public");
    expect(p.slug).toMatch(/^nowruz-fest-[a-z0-9]{6}$/);
    expect(p.createdBy).toBe("usr_m");
    expect(published).toMatchObject([
      { type: "blog.post.published", postId: p.id, visibility: "public", authorId: "usr_m" },
    ]);
  });

  it("createPost rejects a too-short title with VALIDATION", async () => {
    await expect(
      createPost(t.db, { title: "x", content: doc("egal") }, "usr_m"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("createPost persists an explicit category", async () => {
    const p = await createPost(
      t.db,
      { title: "Bericht", content: doc("x"), category: "gruppenleben" },
      "usr_m",
    );
    expect(p.category).toBe("gruppenleben");
  });

  it("createPost defaults category to 'sonstiges'", async () => {
    const p = await createPost(t.db, { title: "Ohne Kategorie", content: doc("x") }, "usr_m");
    expect(p.category).toBe("sonstiges");
  });

  it("createPost rejects an invalid category with VALIDATION", async () => {
    await expect(
      createPost(t.db, { title: "Bad", content: doc("x"), category: "unsinn" }, "usr_m"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("updatePost changes the category", async () => {
    const p = await createPost(
      t.db,
      { title: "Start", content: doc("x"), category: "sonstiges" },
      "usr_m",
    );
    const edited = await updatePost(t.db, p.id, {
      title: "Start",
      content: doc("x"),
      category: "politik_positionen",
    });
    expect(edited.category).toBe("politik_positionen");
  });

  it("createPost throws RateLimitError past 3 posts/hour for the same author", async () => {
    for (let i = 0; i < 3; i++) {
      await createPost(t.db, { title: `Post ${i}`, content: doc("x") }, "usr_spammer");
    }
    await expect(
      createPost(t.db, { title: "Post 4", content: doc("x") }, "usr_spammer"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("createPost rate-limit is per-author — a different author is unaffected", async () => {
    for (let i = 0; i < 3; i++) {
      await createPost(t.db, { title: `Post ${i}`, content: doc("x") }, "usr_busy");
    }
    const p = await createPost(t.db, { title: "Fine", content: doc("x") }, "usr_other");
    expect(p.title).toBe("Fine");
  });

  it("updatePost edits title/content/visibility and emits", async () => {
    const updated = capture("blog.post.updated");
    const p = await createPost(t.db, { title: "Entwurf", content: doc("alt") }, "usr_m");

    const edited = await updatePost(t.db, p.id, {
      title: "Fertiger Beitrag",
      content: doc("neu"),
      visibility: "members",
    });

    expect(edited.slug).toBe(p.slug); // slug immutable
    expect(edited.title).toBe("Fertiger Beitrag");
    expect(edited.visibility).toBe("members");
    expect(updated).toMatchObject([{ type: "blog.post.updated", postId: p.id }]);
  });

  it("deletePost removes the row and emits", async () => {
    const deleted = capture("blog.post.deleted");
    const p = await createPost(t.db, { title: "Weg damit", content: doc("x") }, "usr_m");

    await deletePost(t.db, p.id);

    expect(await getPostBySlug(t.db, p.slug, federal)).toBeNull();
    expect(deleted).toMatchObject([{ type: "blog.post.deleted", postId: p.id }]);
  });

  it("deletePost soft-deletes: the row remains with deleted_at set", async () => {
    const p = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_m");
    await deletePost(t.db, p.id);

    const rows = await t.client`SELECT deleted_at FROM posts WHERE id = ${p.id}`;
    expect(rows[0]?.["deleted_at"]).not.toBeNull();
  });

  it("getPostById returns null for a soft-deleted post", async () => {
    const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_m");
    await deletePost(t.db, p.id);

    expect(await getPostById(t.db, p.id)).toBeNull();
  });

  it("a soft-deleted post is excluded from listPosts even for its author", async () => {
    // `member`'s userId is "usr_m" — the same id used as the author below, so
    // this genuinely exercises the author-sees-own path, not just federal's.
    const p = await createPost(
      t.db,
      { title: "Gelöscht", content: doc("x"), visibility: "board" },
      "usr_m",
    );
    await deletePost(t.db, p.id);

    const feed = await listPosts(t.db, member);
    expect(feed.map((x) => x.id)).not.toContain(p.id);
  });

  it("listPosts filters by visibility and returns newest first", async () => {
    const pub = await createPost(
      t.db,
      { title: "Oeffentlich", content: doc("a"), visibility: "public" },
      "usr_author",
    );
    const mem = await createPost(
      t.db,
      { title: "Mitglieder", content: doc("b"), visibility: "members" },
      "usr_author",
    );
    const board = await createPost(
      t.db,
      { title: "Vorstand", content: doc("c"), visibility: "board" },
      "usr_author",
    );

    // Guest: only public.
    const guestFeed = await listPosts(t.db, ANON);
    expect(guestFeed.map((p) => p.id)).toEqual([pub.id]);

    // Member: public + members, newest first.
    const memberFeed = await listPosts(t.db, member);
    expect(memberFeed.map((p) => p.id)).toEqual([mem.id, pub.id]);

    // Federal: all three, newest first.
    const federalFeed = await listPosts(t.db, federal);
    expect(federalFeed.map((p) => p.id)).toEqual([board.id, mem.id, pub.id]);
  });

  it("listPosts filters by category", async () => {
    const a = await createPost(
      t.db,
      { title: "Ankündigung", content: doc("a"), category: "verbandsintern" },
      "usr_cat",
    );
    await createPost(
      t.db,
      { title: "Bericht", content: doc("b"), category: "gruppenleben" },
      "usr_cat",
    );

    const filtered = await listPosts(t.db, federal, { category: "verbandsintern" });
    expect(filtered.map((p) => p.id)).toEqual([a.id]);
  });

  it("listPosts filters by since (time range)", async () => {
    const old = await createPost(t.db, { title: "Alt", content: doc("a") }, "usr_time");
    const recent = await createPost(t.db, { title: "Neu", content: doc("b") }, "usr_time");

    // Backdate the first post 40 days so a 30-day cutoff excludes it.
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await t.client`UPDATE posts SET created_at = ${fortyDaysAgo.toISOString()} WHERE id = ${old.id}`;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filtered = await listPosts(t.db, federal, { since: thirtyDaysAgo });
    expect(filtered.map((p) => p.id)).toEqual([recent.id]);
  });

  it("author sees their own restricted post in the feed and by slug", async () => {
    const board = await createPost(
      t.db,
      { title: "Nur Vorstand", content: doc("geheim"), visibility: "board" },
      "usr_m",
    );

    // usr_m is a plain member but the author → sees it.
    const feed = await listPosts(t.db, member);
    expect(feed.map((p) => p.id)).toContain(board.id);
    expect(await getPostBySlug(t.db, board.slug, member)).not.toBeNull();
  });

  it("getPostBySlug hides a board post from a guest (share-link guard)", async () => {
    const board = await createPost(
      t.db,
      { title: "Geheim", content: doc("x"), visibility: "board" },
      "usr_author",
    );
    expect(await getPostBySlug(t.db, board.slug, ANON)).toBeNull();
  });

  it("reportPost inserts a report and emits blog.post.reported", async () => {
    const reported = capture("blog.post.reported");
    const p = await createPost(t.db, { title: "Fragwürdig", content: doc("x") }, "usr_author");

    await reportPost(t.db, p.id, "usr_reporter", "Wirkt wie Spam");

    expect(reported).toMatchObject([
      {
        type: "blog.post.reported",
        postId: p.id,
        reporterId: "usr_reporter",
        reason: "Wirkt wie Spam",
      },
    ]);
  });

  it("reportPost rejects a self-report with VALIDATION", async () => {
    const p = await createPost(t.db, { title: "Eigenbeitrag", content: doc("x") }, "usr_author");
    await expect(reportPost(t.db, p.id, "usr_author", null)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("reportPost throws NotFoundError for a nonexistent post", async () => {
    await expect(reportPost(t.db, "post_missing", "usr_reporter", null)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("reportPost throws NotFoundError for an already soft-deleted post", async () => {
    const p = await createPost(t.db, { title: "Weg", content: doc("x") }, "usr_author");
    await deletePost(t.db, p.id);
    await expect(reportPost(t.db, p.id, "usr_reporter", null)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("reportPost rate-limits a reporter past 10 reports/24h", async () => {
    // Distinct authors: createPost has its own 3-posts/hour-per-author rate
    // limit, and 11 concurrent creates under the same author id can race
    // against that unrelated limiter (non-atomic count-then-insert), which
    // has nothing to do with what this test asserts.
    const targets = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        createPost(t.db, { title: `Ziel ${i}`, content: doc("x") }, `usr_author_${i}`),
      ),
    );
    for (let i = 0; i < 10; i++) {
      await reportPost(t.db, targets[i]!.id, "usr_flagger", null);
    }
    await expect(reportPost(t.db, targets[10]!.id, "usr_flagger", null)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("listOpenReports returns only open reports newest first, excluding deleted posts", async () => {
    const keep = await createPost(t.db, { title: "Bleibt", content: doc("x") }, "usr_author");
    const gone = await createPost(t.db, { title: "Gelöscht", content: doc("x") }, "usr_author");

    await reportPost(t.db, keep.id, "usr_r1", "Grund A");
    await reportPost(t.db, gone.id, "usr_r2", "Grund B");
    await deletePost(t.db, gone.id);

    const open = await listOpenReports(t.db);
    expect(open.map((r) => r.postId)).toEqual([keep.id]);
    expect(open[0]?.postTitle).toBe("Bleibt");
  });

  it("dismissReport marks a report dismissed and it disappears from listOpenReports", async () => {
    const p = await createPost(t.db, { title: "Geprüft", content: doc("x") }, "usr_author");
    await reportPost(t.db, p.id, "usr_reporter", null);
    const [report] = await listOpenReports(t.db);

    await dismissReport(t.db, report!.id);

    expect(await listOpenReports(t.db)).toEqual([]);
  });

  it("countOpenReports zählt offene Meldungen und ignoriert verworfene", async () => {
    const p1 = await createPost(t.db, { title: "Erster Beitrag", content: doc("Text.") }, "usr_a");
    const p2 = await createPost(t.db, { title: "Zweiter Beitrag", content: doc("Text.") }, "usr_a");
    await reportPost(t.db, p1.id, "usr_reporter", "Wirkt wie Spam");
    await reportPost(t.db, p2.id, "usr_reporter", null);

    expect(await countOpenReports(t.db)).toBe(2);

    const [open] = await listOpenReports(t.db);
    await dismissReport(t.db, open!.id);

    expect(await countOpenReports(t.db)).toBe(1);
  });
});
