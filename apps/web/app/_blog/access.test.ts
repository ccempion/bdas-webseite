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

import { canAuthorPost, canComment, resolveAuthor, resolveAuthors } from "./access";

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

function memberWithGrants(grants: CurrentMember["grants"]): CurrentMember {
  return {
    user: { id: "usr_1", email: "a@bdas.de", status: "active", roles: [], sessionId: "sess_1" },
    member: {
      id: "mem_1",
      userId: "usr_1",
      firstName: "Ada",
      lastName: "Lovelace",
      primaryGroupId: "grp_a",
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants,
  };
}

describe("canComment", () => {
  it("allows an active member", () => {
    expect(canComment(memberWithStatus("active"))).toBe(true);
  });

  it("allows an alumnus", () => {
    expect(canComment(memberWithStatus("alumnus"))).toBe(true);
  });

  it("rejects a pending member", () => {
    expect(canComment(memberWithStatus("pending"))).toBe(false);
  });

  it("rejects an inactive member", () => {
    expect(canComment(memberWithStatus("inactive"))).toBe(false);
  });

  it("rejects a signed-out visitor", () => {
    expect(canComment(null)).toBe(false);
  });

  it("rejects a signed-in user with no member profile yet", () => {
    const me: CurrentMember = {
      user: { id: "usr_2", email: "b@bdas.de", status: "active", roles: [], sessionId: "sess_2" },
      member: null,
      grants: [],
    };
    expect(canComment(me)).toBe(false);
  });
});

describe("canAuthorPost", () => {
  it("allows federal_board", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "federal_board", groupId: null }]))).toBe(true);
  });

  it("allows local_board_lead (Lead)", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "local_board_lead", groupId: "grp_a" }]))).toBe(
      true,
    );
  });

  it("allows event_organizer (Event-Manager)", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "event_organizer", groupId: "grp_a" }]))).toBe(
      true,
    );
  });

  it("allows blogger", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "blogger", groupId: "grp_a" }]))).toBe(true);
  });

  it("rejects an active member with no qualifying grant — the ADR 0030 default no longer applies", () => {
    expect(canAuthorPost(memberWithStatus("active"))).toBe(false);
  });

  it("rejects an alumnus with no qualifying grant", () => {
    expect(canAuthorPost(memberWithStatus("alumnus"))).toBe(false);
  });

  it("rejects file_manager and page_editor — neither is a blog-authoring role", () => {
    expect(canAuthorPost(memberWithGrants([{ role: "file_manager", groupId: "grp_a" }]))).toBe(
      false,
    );
    expect(canAuthorPost(memberWithGrants([{ role: "page_editor", groupId: "grp_a" }]))).toBe(
      false,
    );
  });

  it("rejects a signed-out visitor", () => {
    expect(canAuthorPost(null)).toBe(false);
  });
});

describe("ADR 0037: posting is restricted, commenting is preserved", () => {
  it("a plain active member (no board/blog role) can NO LONGER post, but CAN STILL comment", () => {
    const plainActiveMember = memberWithStatus("active");
    expect(canAuthorPost(plainActiveMember)).toBe(false);
    expect(canComment(plainActiveMember)).toBe(true);
  });

  it("a plain alumnus can NO LONGER post, but CAN STILL comment", () => {
    const plainAlumnus = memberWithStatus("alumnus");
    expect(canAuthorPost(plainAlumnus)).toBe(false);
    expect(canComment(plainAlumnus)).toBe(true);
  });

  it("a blogger CAN post — that grant exists for exactly this", () => {
    const blogger = memberWithGrants([{ role: "blogger", groupId: "grp_a" }]);
    expect(canAuthorPost(blogger)).toBe(true);
    expect(canComment(blogger)).toBe(true); // still an active member underneath
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
