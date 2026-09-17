import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, seedUser, setupOnboardingDb } from "./test-db";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

async function insert(t: TestDb, over: Record<string, unknown> = {}): Promise<void> {
  const row = {
    id: "onb_1",
    user_id: "usr_1",
    flow_version: 1,
    outcome: "student",
    status: "details_offen",
    ...over,
  };
  await t.client`INSERT INTO onboarding_journeys ${t.client(row)}`;
}

describeIfDb("onboarding_journeys", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupOnboardingDb();
    await seedUser(t, "usr_1");
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("defaults answers, details and the entry source", async () => {
    await insert(t);
    const [row] = await t.client`SELECT answers, details, entry_source FROM onboarding_journeys`;
    expect(row).toEqual({ answers: {}, details: {}, entry_source: "direkt" });
  });

  it("allows one journey per account", async () => {
    await insert(t);
    await expect(insert(t, { id: "onb_2" })).rejects.toThrow(/unique/i);
  });

  it("rejects an unknown outcome or status", async () => {
    await expect(insert(t, { outcome: "hacker" })).rejects.toThrow(/check/i);
    await expect(insert(t, { status: "fertig" })).rejects.toThrow(/check/i);
  });

  it("rejects a journey for a user that does not exist", async () => {
    await expect(insert(t, { user_id: "usr_fehlt" })).rejects.toThrow(/foreign key/i);
  });

  it("disappears with the account", async () => {
    await insert(t);
    await t.client`DELETE FROM auth_users WHERE id = 'usr_1'`;
    const rows = await t.client`SELECT 1 FROM onboarding_journeys`;
    expect(rows).toHaveLength(0);
  });

  it("has row-level security switched on", async () => {
    const [row] = await t.client`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'onboarding_journeys'`;
    expect(row?.["relrowsecurity"]).toBe(true);
  });
});
