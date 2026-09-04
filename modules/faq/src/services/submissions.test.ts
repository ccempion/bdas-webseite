import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import {
  createSubmission,
  discardSubmission,
  listSubmissions,
  openSubmissionCount,
} from "./submissions";

const reachable = await dbReachable();

describe.skipIf(!reachable)("submissions service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates open submissions, counts them, and lists newest first", async () => {
    const a = await createSubmission(t.db, {
      question: "Wo finde ich X?",
      submittedBy: "m1",
      context: "dateien",
    });
    const b = await createSubmission(t.db, { question: "Und Y?", submittedBy: "m2" });
    expect(a.status).toBe("open");
    expect(await openSubmissionCount(t.db)).toBe(2);

    const list = await listSubmissions(t.db, { status: "open" });
    expect(list).toHaveLength(2);
    // b was created after a, so it must sort first (desc createdAt).
    expect(list[0]!.id).toBe(b.id);
    expect(list[0]!.context).toBeNull();
    expect(list[1]!.id).toBe(a.id);
    expect(list[1]!.context).toBe("dateien");
  });

  it("rejects a blank question, an over-long question, and over-long details", async () => {
    await expect(createSubmission(t.db, { question: " ", submittedBy: "m1" })).rejects.toThrow();
    await expect(
      createSubmission(t.db, { question: "x".repeat(301), submittedBy: "m1" }),
    ).rejects.toThrow();
    await expect(
      createSubmission(t.db, {
        question: "Wo?",
        submittedBy: "m1",
        details: "x".repeat(2001),
      }),
    ).rejects.toThrow();
  });

  it("accepts boundary lengths for question and details", async () => {
    const s = await createSubmission(t.db, {
      question: "x".repeat(300),
      details: "y".repeat(2000),
      submittedBy: "m1",
    });
    expect(s.question).toHaveLength(300);
    expect(s.details).toHaveLength(2000);
  });

  it("discard sets status and decided fields; count drops; unknown id throws NotFound", async () => {
    const s = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    await discardSubmission(t.db, { id: s.id, decidedBy: "board1" });
    expect(await openSubmissionCount(t.db)).toBe(0);

    const [row] = await listSubmissions(t.db);
    expect(row!.status).toBe("discarded");

    const [raw] = await t.client`
      SELECT decided_by, decided_at FROM faq_submissions WHERE id = ${s.id}
    `;
    expect(raw?.["decided_by"]).toBe("board1");
    expect(raw?.["decided_at"]).not.toBeNull();

    await expect(discardSubmission(t.db, { id: "nope", decidedBy: "b" })).rejects.toThrow();
  });
});
