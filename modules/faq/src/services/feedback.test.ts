import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NotFoundError } from "@bdas/errors";
import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import { createEntry } from "./entries";
import { feedbackCounts, upsertFeedback } from "./feedback";

const reachable = await dbReachable();
const doc = { type: "doc", content: [] };

describe.skipIf(!reachable)("feedback service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("one vote per user, changeable; counts aggregate", async () => {
    const e = await createEntry(t.db, {
      section: "mitglieder",
      question: "F?",
      body: doc,
      updatedBy: "u",
    });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: true });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: false }); // ändert die Stimme
    await upsertFeedback(t.db, { entryId: e.id, userId: "m2", helpful: true });
    const counts = await feedbackCounts(t.db, [e.id]);
    expect(counts.get(e.id)).toEqual({ up: 1, down: 1 });
  });

  it("changing a vote replaces the row rather than adding a second one", async () => {
    // Strengthens the test above: the aggregate could look right even if a
    // buggy implementation left stray rows behind (e.g. two entries both
    // counted as "helpful" cancelling out a missed down-vote elsewhere).
    // Reading the raw table directly proves the composite PK holds exactly
    // one row per (entry, user), which is the actual domain rule.
    const e = await createEntry(t.db, {
      section: "mitglieder",
      question: "F?",
      body: doc,
      updatedBy: "u",
    });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: true });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: false });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: true });

    const rows =
      await t.client`select helpful from faq_feedback where entry_id = ${e.id} and user_id = 'm1'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!["helpful"]).toBe(true);
  });

  it("counts are isolated per entry", async () => {
    // A buggy aggregate query (missing GROUP BY, or summing across all
    // entryIds passed in) would still pass a single-entry count test. This
    // forces per-entry separation to actually work.
    const a = await createEntry(t.db, {
      section: "mitglieder",
      question: "A?",
      body: doc,
      updatedBy: "u",
    });
    const b = await createEntry(t.db, {
      section: "mitglieder",
      question: "B?",
      body: doc,
      updatedBy: "u",
    });
    await upsertFeedback(t.db, { entryId: a.id, userId: "m1", helpful: true });
    await upsertFeedback(t.db, { entryId: a.id, userId: "m2", helpful: true });
    await upsertFeedback(t.db, { entryId: b.id, userId: "m1", helpful: false });

    const counts = await feedbackCounts(t.db, [a.id, b.id]);
    expect(counts.get(a.id)).toEqual({ up: 2, down: 0 });
    expect(counts.get(b.id)).toEqual({ up: 0, down: 1 });
  });

  it("an entry with no votes is absent from the map", async () => {
    const e = await createEntry(t.db, {
      section: "mitglieder",
      question: "F?",
      body: doc,
      updatedBy: "u",
    });
    const counts = await feedbackCounts(t.db, [e.id]);
    expect(counts.has(e.id)).toBe(false);
  });

  it("empty entryIds returns an empty map", async () => {
    const counts = await feedbackCounts(t.db, []);
    expect(counts.size).toBe(0);
  });

  it("unknown entry throws NotFoundError", async () => {
    // The brief's generic `.rejects.toThrow()` would also pass if the FK
    // violation leaked through unhandled as a raw postgres error, or as some
    // other thrown value — it does not prove translation happened. Assert
    // the concrete German-messaged NotFoundError instead.
    await expect(
      upsertFeedback(t.db, { entryId: "nope", userId: "m1", helpful: true }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      upsertFeedback(t.db, { entryId: "nope", userId: "m1", helpful: true }),
    ).rejects.toThrow("Eintrag nicht gefunden.");
  });
});
