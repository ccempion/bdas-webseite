import { describe, expect, it } from "vitest";

import type { Member } from "@bdas/members";

import { groupNamesByUserId } from "./member-groups";

const member = (over: Partial<Member> & { userId: string }): Member => ({
  id: `mem_${over.userId}`,
  firstName: "Mara",
  lastName: "Beispiel",
  primaryGroupId: null,
  status: "active",
  joinedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...over,
});

const GROUPS = [
  { id: "grp_ac", name: "HG Aachen" },
  { id: "grp_mg", name: "HG Mönchengladbach" },
];

describe("groupNamesByUserId", () => {
  it("maps an account to the name of its group", () => {
    const map = groupNamesByUserId([member({ userId: "u1", primaryGroupId: "grp_ac" })], GROUPS);
    expect(map.get("u1")).toBe("HG Aachen");
  });

  it("leaves out a member without a group rather than inventing a label", () => {
    const map = groupNamesByUserId([member({ userId: "u1" })], GROUPS);
    expect(map.has("u1")).toBe(false);
  });

  it("leaves out a group that no longer exists", () => {
    const map = groupNamesByUserId([member({ userId: "u1", primaryGroupId: "grp_weg" })], GROUPS);
    expect(map.has("u1")).toBe(false);
  });
});
