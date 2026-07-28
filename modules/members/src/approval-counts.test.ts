/**
 * Integration tests for the approval counter that feeds the header badge.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
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

  /** A pending member in `groupId`. Pending is what createProfile writes. */
  async function pendingMember(userId: string, groupId: string): Promise<string> {
    await createUser(t, userId, `${userId}@example.de`);
    const m = await createProfile(t.db, {
      userId,
      firstName: "Test",
      lastName: "Person",
      primaryGroupId: groupId,
    });
    return m.id;
  }

  async function activeMember(userId: string, groupId: string): Promise<string> {
    const id = await pendingMember(userId, groupId);
    await approveMember(t.db, id, FEDERAL);
    return id;
  }

  it("zählt für den Bundesvorstand alle offenen Mitglieder", async () => {
    await pendingMember("usr_1", "grp_a");
    await pendingMember("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, FEDERAL);

    expect(counts.pendingMembers).toBe(2);
  });

  it("zählt für einen lokalen Vorstand nur die eigene Gruppe", async () => {
    await pendingMember("usr_1", "grp_a");
    await pendingMember("usr_2", "grp_b");

    const counts = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(counts.pendingMembers).toBe(1);
  });

  it("gibt einem einfachen Mitglied Nullen statt eines Fehlers", async () => {
    await pendingMember("usr_1", "grp_a");

    const counts = await countPendingApprovals(t.db, PLAIN);

    expect(counts).toEqual({ pendingMembers: 0, incomingGroupChanges: 0 });
  });

  it("zählt einen Gruppenwechsel beim Zielvorstand, nicht beim Herkunftsvorstand", async () => {
    const moverId = await activeMember("usr_mover", "grp_a");
    await changePrimaryGroup(t.db, moverId, "grp_b", {
      userId: "usr_mover",
      grants: PLAIN.grants,
    });

    const target = await countPendingApprovals(t.db, boardOf("usr_board_b", "grp_b"));
    const origin = await countPendingApprovals(t.db, boardOf("usr_board_a", "grp_a"));

    expect(target.incomingGroupChanges).toBe(1);
    expect(origin.incomingGroupChanges).toBe(0);
  });
});
