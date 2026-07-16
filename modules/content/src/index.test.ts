/**
 * Content integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import type { ContentPageSaved } from "./events";
import { getPage, savePage } from "./services/pages";
import { dbReachable, setupContentDb } from "./test-db";
import type { ContentActor } from "./types";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const SLUG = "ueber-uns/bundessprecherinnenrat";

const FEDERAL: ContentActor = {
  userId: "usr_federal",
  grants: [{ role: "federal_board", groupId: null }],
};
const PLAIN: ContentActor = {
  userId: "usr_plain",
  grants: [{ role: "member", groupId: null }],
};

const DOC = {
  root: { props: {} },
  content: [{ type: "Absatz", props: { id: "Absatz-1", text: "Hallo BSR" } }],
};

describeIfDb("content pages service", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupContentDb();
    resetEventBus();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("save → get roundtrip", async () => {
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    const page = await getPage(t.db, SLUG);
    expect(page?.slug).toBe(SLUG);
    expect(page?.data).toEqual(DOC);
    expect(page?.updatedAt).toBeInstanceOf(Date);
  });

  it("preserves unknown top-level keys on components (opaque storage)", async () => {
    const doc = {
      root: { props: {} },
      content: [
        { type: "Absatz", props: { id: "Absatz-1", text: "Hallo BSR" }, readOnly: true },
      ],
    };
    await savePage(t.db, { slug: SLUG, data: doc, actor: FEDERAL });
    const page = await getPage(t.db, SLUG);
    expect(page?.data).toEqual(doc);
  });

  it("getPage returns null for an unknown slug", async () => {
    expect(await getPage(t.db, "nicht/da")).toBeNull();
  });

  it("saving again overwrites (upsert) and stamps updated_by", async () => {
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    const second = {
      root: { props: {} },
      content: [{ type: "Absatz", props: { id: "Absatz-1", text: "Neuer Text" } }],
    };
    await savePage(t.db, {
      slug: SLUG,
      data: second,
      actor: { userId: "usr_zweite", grants: FEDERAL.grants },
    });
    const page = await getPage(t.db, SLUG);
    expect(page?.data).toEqual(second);
    const rows = await t.client`SELECT updated_by FROM content_pages WHERE slug = ${SLUG}`;
    expect(rows[0]?.["updated_by"]).toBe("usr_zweite");
  });

  it("rejects a non-federal actor", async () => {
    await expect(savePage(t.db, { slug: SLUG, data: DOC, actor: PLAIN })).rejects.toThrow(
      /Bundesvorstand/,
    );
    expect(await getPage(t.db, SLUG)).toBeNull();
  });

  it("rejects an invalid slug", async () => {
    await expect(
      savePage(t.db, { slug: "Über Uns/BSR!", data: DOC, actor: FEDERAL }),
    ).rejects.toThrow(/Slug/);
  });

  it("rejects a document that is not Puck-shaped", async () => {
    await expect(
      savePage(t.db, { slug: SLUG, data: { html: "<script>alert(1)</script>" }, actor: FEDERAL }),
    ).rejects.toThrow(/Seitendokument/);
  });

  it("rejects an oversized document", async () => {
    const big = {
      root: { props: {} },
      content: [{ type: "Absatz", props: { id: "a", text: "x".repeat(600 * 1024) } }],
    };
    await expect(savePage(t.db, { slug: SLUG, data: big, actor: FEDERAL })).rejects.toThrow(
      /zu groß/,
    );
  });

  it("emits content.page.saved", async () => {
    const seen: ContentPageSaved[] = [];
    getEventBus().subscribe<ContentPageSaved>("content.page.saved", (e) => {
      seen.push(e);
    });
    await savePage(t.db, { slug: SLUG, data: DOC, actor: FEDERAL });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ slug: SLUG, updatedBy: "usr_federal" });
  });
});
