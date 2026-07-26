import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  cache: (fn: unknown) => fn,
}));
vi.mock("next/navigation", () => ({}));
vi.mock("../../lib/auth-cookie", () => ({
  readSessionCookie: () => null,
}));
vi.mock("@bdas/db", () => ({
  getDb: () => ({}),
}));
vi.mock("@bdas/members", () => ({
  getCurrentMember: async () => null,
  getMemberByUserId: async () => null,
  isFederalBoard: () => false,
}));
vi.mock("@bdas/blog", () => ({
  ANON: { userId: null, isMember: false, isFederal: false },
  canModeratePost: () => false,
}));

import type { CurrentMember } from "@bdas/members";

import { canAuthor } from "./access";

function memberWithStatus(status: "pending" | "active" | "inactive" | "alumnus"): CurrentMember {
  return {
    user: { id: "usr_1", email: "a@bdas.de", status: "active", roles: [], sessionId: "sess_1" },
    member: {
      id: "mem_1",
      userId: "usr_1",
      firstName: "Ada",
      lastName: "Lovelace",
      primaryGroupId: null,
      status,
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
  };
}

describe("canAuthor", () => {
  it("allows an active member", () => {
    expect(canAuthor(memberWithStatus("active"))).toBe(true);
  });

  it("allows an alumnus", () => {
    expect(canAuthor(memberWithStatus("alumnus"))).toBe(true);
  });

  it("rejects a pending member", () => {
    expect(canAuthor(memberWithStatus("pending"))).toBe(false);
  });

  it("rejects an inactive member", () => {
    expect(canAuthor(memberWithStatus("inactive"))).toBe(false);
  });

  it("rejects a signed-out visitor", () => {
    expect(canAuthor(null)).toBe(false);
  });

  it("rejects a signed-in user with no member profile yet", () => {
    const me: CurrentMember = {
      user: { id: "usr_2", email: "b@bdas.de", status: "active", roles: [], sessionId: "sess_2" },
      member: null,
      grants: [],
    };
    expect(canAuthor(me)).toBe(false);
  });
});
