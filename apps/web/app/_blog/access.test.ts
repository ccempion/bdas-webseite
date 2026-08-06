import { beforeEach, describe, expect, it, vi } from "vitest";

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
const members = new Map<string, { firstName: string; lastName: string }>([
  ["usr_photo", { firstName: "Ada", lastName: "Lovelace" }],
  ["usr_nophoto", { firstName: "Grace", lastName: "Hopper" }],
]);
vi.mock("@bdas/members", () => ({
  getCurrentMember: async () => null,
  getMemberByUserId: async (_db: unknown, id: string) =>
    members.has(id) ? { userId: id, ...members.get(id) } : null,
  isFederalBoard: () => false,
}));
vi.mock("@bdas/blog", () => ({
  ANON: { userId: null, isMember: false, isFederal: false },
  canModeratePost: () => false,
}));
vi.mock("@bdas/profile", () => ({
  getProfile: async (_db: unknown, id: string) =>
    id === "usr_photo" ? { userId: id, photoStorageKey: "profiles/usr_photo.jpg" } : null,
}));
const signPhoto = vi.fn(async (key: string | null | undefined) =>
  key ? `https://signed.example/${key}` : null,
);
vi.mock("../_profile/photo-url", () => ({
  signedProfilePhotoUrl: (key: string | null | undefined) => signPhoto(key),
}));

import type { CurrentMember } from "@bdas/members";

import { canAuthor, resolveAuthor, resolveAuthors } from "./access";

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

describe("resolveAuthor photo", () => {
  beforeEach(() => {
    signPhoto.mockClear();
  });

  it("returns a signed photo URL when the author has one and photos are allowed", async () => {
    const author = await resolveAuthor("usr_photo", true);
    expect(author.name).toBe("Ada Lovelace");
    expect(author.photoUrl).toBe("https://signed.example/profiles/usr_photo.jpg");
  });

  it("returns null and never signs anything for a signed-out viewer", async () => {
    const author = await resolveAuthor("usr_photo", false);
    expect(author.photoUrl).toBeNull();
    expect(author.initials).toBe("AL");
    expect(signPhoto).not.toHaveBeenCalled();
  });

  it("defaults to no photo when the caller omits the flag", async () => {
    expect((await resolveAuthor("usr_photo")).photoUrl).toBeNull();
    expect(signPhoto).not.toHaveBeenCalled();
  });

  it("returns null for an author without a profile row", async () => {
    expect((await resolveAuthor("usr_nophoto", true)).photoUrl).toBeNull();
  });

  it("falls back to the anonymous display when the member is unknown", async () => {
    const author = await resolveAuthor("usr_gone", true);
    expect(author.name).toBe("BDAS-Mitglied");
    expect(author.photoUrl).toBeNull();
  });

  it("resolves photos per unique author in a feed", async () => {
    const authors = await resolveAuthors(["usr_photo", "usr_nophoto", "usr_photo"], true);
    expect(authors.get("usr_photo")?.photoUrl).toBe(
      "https://signed.example/profiles/usr_photo.jpg",
    );
    expect(authors.get("usr_nophoto")?.photoUrl).toBeNull();
    expect(signPhoto).toHaveBeenCalledTimes(2);
  });
});
