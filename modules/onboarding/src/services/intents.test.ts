import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, seedUser, setupOnboardingDb } from "../test-db";
import { getApplicationIntents } from "./intents";
import { startJourney } from "./journeys";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

const ENV = { groups: [], bdajGroupId: null, netzwerkGroupId: null };
const NAME = { firstName: "Lea", lastName: "Y" };

describeIfDb("getApplicationIntents", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupOnboardingDb();
    for (const id of ["usr_a", "usr_b", "usr_c"]) await seedUser(t, id);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("returns the outcome and status per user, and nothing for users without a journey", async () => {
    await startJourney(t.db, {
      userId: "usr_a",
      answers: { typ: "studiert", name: NAME, aktiv_wo: { kind: "skipped" } },
      entrySource: "",
      env: ENV,
    });
    await startJourney(t.db, {
      userId: "usr_b",
      answers: { typ: "unterstuetzen", name: NAME },
      entrySource: "",
      env: ENV,
    });

    const intents = await getApplicationIntents(t.db, ["usr_a", "usr_b", "usr_c"]);
    expect(intents.get("usr_a")).toEqual({ outcome: "alumnus", status: "details_offen" });
    expect(intents.get("usr_b")).toEqual({ outcome: "foerderer", status: "details_offen" });
    expect(intents.has("usr_c")).toBe(false);
  });

  it("does not query for an empty list", async () => {
    expect((await getApplicationIntents(t.db, [])).size).toBe(0);
  });
});
