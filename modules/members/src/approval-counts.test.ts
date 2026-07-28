/**
 * Integration tests for the approval counter that feeds the header badge.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Since ADR 0031 both numbers come from the request table: an applicant files
 * `NULL → group`, a member moving files `group → group`. The fixtures below go
 * through `changePrimaryGroup` rather than seeding `primary_group_id`, because
 * writing that column is exactly what an application no longer does.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { countPendingApprovals } from "./services/approval-counts";
import { changePrimaryGroup } from "./services/group-change";
import { createProfile } from "./services/profile";
import { approveMember } from "./services/status";
import { createGroup, createUser, dbReachable, setupMembersDb } from "./test-db";
import type { Grant } from "./types";

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

const FEDERAL = {
  userId: "usr_fed",
  grants: [{ role: "federal_board", groupId: null }] as ReadonlyArray<Grant>,
};
const PLAIN = {
  userId: "usr_plain",
  grants: [{ role: "member", groupId: null }] as ReadonlyArray<Grant>,
};
const self = (userId: string) => ({ userId, grants: PLAIN.grants });
const boardOf = (userId: string, groupId: string) => ({
  userId,
  grants: [{ role: "local_board", groupId }] as ReadonlyArray<Grant>,
});

describeIfDb("countPendingApprovals", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupMembersDb();
    resetEventBus();
    await createGroup(t, "grp_a", "aachen");
    await createGroup(t, "grp_b", "bonn");
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Someone who registered and applied to `groupId`: groupless, one open request. */
  async function applicant(userId: string, groupId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, { userId, firstName: "Test", lastName: "Person" });
    await changePrimaryGroup(t.db, m.id, groupId, self(userId));
    return m.id;
  }

  /** An accepted member of `groupId`, seeded directly — not an application. */
  async function activeMember(userId: string, groupId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    await approveMember(t.db, m.id, FEDERAL);
    return m.id;
  }

  it("zählt für den Bundesvorstand alle offenen Bewerbungen", async () => {
    await applicant("usr_1", "grp_a");
    await applicant("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, FEDERAL);

    expect(counts.applications).toBe(2);
  });

  it("zählt für einen lokalen Vorstand nur die eigene Gruppe", async () => {
    await applicant("usr_1", "grp_a");
    await applicant("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(counts.applications).toBe(1);
  });

  it("gibt einem einfachen Mitglied Nullen statt eines Fehlers", async () => {
    await applicant("usr_1", "grp_a");

    const counts = await countPendingApprovals(t.db, PLAIN);

    expect(counts).toEqual({ applications: 0, groupTransfers: 0 });
  });

  it("zählt einen Gruppenwechsel beim Zielvorstand, nicht beim Herkunftsvorstand", async () => {
    const moverId = await activeMember("usr_mover", "grp_a");
    await changePrimaryGroup(t.db, moverId, "grp_b", self("usr_mover"));

    const target = await countPendingApprovals(t.db, boardOf("usr_board_b", "grp_b"));
    const origin = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(target.groupTransfers).toBe(1);
    expect(origin.groupTransfers).toBe(0);
  });

  // The badge sums the two, so counting an applicant as both a pending member
  // and an open request — which the pre-ADR-0031 shape did — showed double.
  it("hält Bewerbung und Gruppenwechsel in dieselbe Gruppe auseinander", async () => {
    await applicant("usr_neu", "grp_b");
    const moverId = await activeMember("usr_mover", "grp_a");
    await changePrimaryGroup(t.db, moverId, "grp_b", self("usr_mover"));

    const counts = await countPendingApprovals(t.db, boardOf("usr_board_b", "grp_b"));

    expect(counts.applications).toBe(1);
    expect(counts.groupTransfers).toBe(1);
  });
});
