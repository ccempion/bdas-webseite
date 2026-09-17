import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { loadFlowEnv } from "./env";
import { dbReachable, seedGroup, setupOnboardingDb } from "./test-db";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

describeIfDb("loadFlowEnv", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupOnboardingDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("lists only active university groups", async () => {
    await seedGroup(t, { id: "grp_ber", slug: "berlin", kind: "hochschulgruppe" });
    await seedGroup(t, { id: "grp_alt", slug: "alt", kind: "hochschulgruppe", status: "archived" });
    await seedGroup(t, { id: "grp_netz", slug: "netzwerk", kind: "netzwerk" });

    const env = await loadFlowEnv(t.db);
    expect(env.groups).toEqual([{ id: "grp_ber", name: "BDAS berlin", city: "Berlin" }]);
  });

  it("finds the bdaj and netzwerk rows by slug and kind", async () => {
    await seedGroup(t, { id: "grp_bdaj", slug: "bdaj", kind: "affiliate" });
    await seedGroup(t, { id: "grp_netz", slug: "netzwerk", kind: "netzwerk" });

    const env = await loadFlowEnv(t.db);
    expect(env.bdajGroupId).toBe("grp_bdaj");
    expect(env.netzwerkGroupId).toBe("grp_netz");
  });

  it("ignores a row with the right slug but the wrong kind or status", async () => {
    await seedGroup(t, { id: "grp_fake", slug: "bdaj", kind: "hochschulgruppe" });
    await seedGroup(t, { id: "grp_netz", slug: "netzwerk", kind: "netzwerk", status: "archived" });

    const env = await loadFlowEnv(t.db);
    expect(env.bdajGroupId).toBeNull();
    expect(env.netzwerkGroupId).toBeNull();
  });

  it("is empty on an empty table", async () => {
    expect(await loadFlowEnv(t.db)).toEqual({ groups: [], bdajGroupId: null, netzwerkGroupId: null });
  });
});
