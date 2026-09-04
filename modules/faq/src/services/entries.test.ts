import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import {
  createEntry,
  deleteEntry,
  listEntries,
  listEntriesByContext,
  publishEntry,
  reorderEntries,
  unpublishEntry,
  updateEntry,
} from "./entries";
import { createSubmission, discardSubmission, listSubmissions } from "./submissions";

const reachable = await dbReachable();
const doc = { type: "doc", content: [] };
const base = {
  section: "mitglieder",
  question: "Wie trete ich bei?",
  body: doc,
  updatedBy: "u1",
} as const;

describe.skipIf(!reachable)("entries service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates a draft with position within (section, subgroup)", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    expect(a.status).toBe("draft");
    expect([a.position, b.position]).toEqual([0, 1]);

    // Position is scoped per (section, subgroup), not a global counter: an
    // entry in a different scope must start over at 0, not continue at 2.
    const c = await createEntry(t.db, {
      ...base,
      section: "vorstand",
      subgroup: "local_board",
      question: "Dritte?",
    });
    expect(c.position).toBe(0);
  });

  it("rejects subgroup outside vorstand and a bad youtube id", async () => {
    await expect(createEntry(t.db, { ...base, subgroup: "local_board" })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, youtubeId: "kurz" })).rejects.toThrow();
  });

  it("rejects a blank question and an over-long question", async () => {
    await expect(createEntry(t.db, { ...base, question: " " })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, question: "x".repeat(301) })).rejects.toThrow();
  });

  it("rejects a body that fails the Tiptap document shape", async () => {
    await expect(createEntry(t.db, { ...base, body: { type: "paragraph" } })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, body: "not a doc" })).rejects.toThrow();
  });

  it("rejects relatedIds containing the entry's own id on update", async () => {
    const a = await createEntry(t.db, { ...base });
    await expect(
      updateEntry(t.db, { id: a.id, ...base, relatedIds: [a.id], updatedBy: "u2" }),
    ).rejects.toThrow();
  });

  it("update replaces contexts and related ids wholesale", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, contexts: ["profil"], relatedIds: [other.id] });
    const upd = await updateEntry(t.db, {
      id: a.id,
      ...base,
      contexts: ["dateien"],
      relatedIds: [],
      updatedBy: "u2",
    });
    expect(upd.contexts).toEqual(["dateien"]);
    expect(upd.relatedIds).toEqual([]);
    expect(upd.updatedBy).toBe("u2");

    // Verify the wholesale replace actually happened in the child tables,
    // independent of the DTO the service handed back.
    const contextRows = await t.client`
      SELECT context FROM faq_entry_contexts WHERE entry_id = ${a.id}
    `;
    expect(contextRows.map((r) => r["context"])).toEqual(["dateien"]);
    const linkRows = await t.client`
      SELECT related_entry_id FROM faq_entry_links WHERE entry_id = ${a.id}
    `;
    expect(linkRows).toHaveLength(0);
  });

  it("listEntriesByContext returns only published entries matching the context", async () => {
    const a = await createEntry(t.db, { ...base, contexts: ["profil"] });
    const other = await createEntry(t.db, {
      ...base,
      question: "Andere?",
      contexts: ["dateien"],
    });
    expect(await listEntriesByContext(t.db, "profil")).toEqual([]);
    await publishEntry(t.db, { id: a.id, updatedBy: "u1" });
    await publishEntry(t.db, { id: other.id, updatedBy: "u1" });

    // Both entries are now published, but only `a` carries the "profil"
    // context — a filter that ignored context would wrongly return both.
    expect((await listEntriesByContext(t.db, "profil")).map((e) => e.id)).toEqual([a.id]);
  });

  it("publish marks a linked submission answered, but not before", async () => {
    const sub = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    const a = await createEntry(t.db, { ...base, submissionId: sub.id });

    // Spec: entry_id is set immediately, status stays "open" until publish.
    const [beforePublish] = await listSubmissions(t.db);
    expect(beforePublish!.status).toBe("open");
    expect(beforePublish!.entryId).toBe(a.id);

    await publishEntry(t.db, { id: a.id, updatedBy: "board1" });
    const [s] = await listSubmissions(t.db);
    expect(s!.status).toBe("answered");
    expect(s!.entryId).toBe(a.id);

    // decided_by/decided_at aren't on the FaqSubmission DTO — read them raw.
    const [raw] = await t.client`
      SELECT decided_by, decided_at FROM faq_submissions WHERE id = ${sub.id}
    `;
    expect(raw?.["decided_by"]).toBe("board1");
    expect(raw?.["decided_at"]).not.toBeNull();
  });

  it("rejects an unusable submissionId — unknown, or not open", async () => {
    await expect(createEntry(t.db, { ...base, submissionId: "nope" })).rejects.toThrow();

    const sub = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    await discardSubmission(t.db, { id: sub.id, decidedBy: "board1" });
    await expect(createEntry(t.db, { ...base, submissionId: sub.id })).rejects.toThrow();

    // The failed link must not have silently created an orphan entry.
    expect(await listEntries(t.db)).toEqual([]);
  });

  it("unpublish returns a published entry to draft", async () => {
    const a = await createEntry(t.db, { ...base });
    await publishEntry(t.db, { id: a.id, updatedBy: "u1" });
    const back = await unpublishEntry(t.db, { id: a.id, updatedBy: "u2" });
    expect(back.status).toBe("draft");
    expect(back.updatedBy).toBe("u2");
  });

  it("delete cascades links without touching the related entry", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, relatedIds: [other.id] });
    await deleteEntry(t.db, { id: a.id });
    const left = await listEntries(t.db);
    expect(left.map((e) => e.id)).toEqual([other.id]);
  });

  it("reorder rewrites positions from the given order", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    await reorderEntries(t.db, {
      section: "mitglieder",
      subgroup: null,
      orderedIds: [b.id, a.id],
    });
    const ids = (await listEntries(t.db)).map((e) => e.id);
    expect(ids).toEqual([b.id, a.id]);
  });

  it("unknown id throws NotFound for update, publish, and unpublish", async () => {
    await expect(updateEntry(t.db, { id: "nope", ...base, updatedBy: "u1" })).rejects.toThrow();
    await expect(publishEntry(t.db, { id: "nope", updatedBy: "u1" })).rejects.toThrow();
    await expect(unpublishEntry(t.db, { id: "nope", updatedBy: "u1" })).rejects.toThrow();
  });
});
