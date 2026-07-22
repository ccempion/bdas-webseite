import { describe, expect, it } from "vitest";

import { ANON, canModeratePost, canViewPost, visibleLevelsFor, type Viewer } from "./visibility";

const guest = ANON;
const member: Viewer = { userId: "usr_m", isMember: true, isFederal: false };
const federal: Viewer = { userId: "usr_f", isMember: true, isFederal: true };
const pending: Viewer = { userId: "usr_p", isMember: false, isFederal: false };

const post = (visibility: "public" | "members" | "board", createdBy = "usr_author") => ({
  visibility,
  createdBy,
});

describe("visibleLevelsFor", () => {
  it("guest sees only public", () => {
    expect(visibleLevelsFor(guest)).toEqual(["public"]);
  });
  it("member sees public + members", () => {
    expect(visibleLevelsFor(member)).toEqual(["public", "members"]);
  });
  it("federal sees all three", () => {
    expect(visibleLevelsFor(federal)).toEqual(["public", "members", "board"]);
  });
  it("signed-in but non-active (pending) sees only public", () => {
    expect(visibleLevelsFor(pending)).toEqual(["public"]);
  });
});

describe("canViewPost", () => {
  it("public is visible to everyone incl. guests", () => {
    expect(canViewPost(guest, post("public"))).toBe(true);
  });
  it("members post hidden from guests, shown to members", () => {
    expect(canViewPost(guest, post("members"))).toBe(false);
    expect(canViewPost(member, post("members"))).toBe(true);
  });
  it("board post shown only to federal board", () => {
    expect(canViewPost(guest, post("board"))).toBe(false);
    expect(canViewPost(member, post("board"))).toBe(false);
    expect(canViewPost(federal, post("board"))).toBe(true);
  });
  it("author always sees own post regardless of level", () => {
    expect(canViewPost(member, post("board", "usr_m"))).toBe(true);
  });
  it("guest (null userId) is never treated as an author", () => {
    expect(canViewPost(guest, post("board", ""))).toBe(false);
  });
});

describe("canModeratePost", () => {
  it("author may moderate own post", () => {
    expect(canModeratePost(member, post("members", "usr_m"))).toBe(true);
  });
  it("non-author non-federal may not", () => {
    expect(canModeratePost(member, post("members", "usr_other"))).toBe(false);
  });
  it("federal board may moderate any post", () => {
    expect(canModeratePost(federal, post("members", "usr_other"))).toBe(true);
  });
  it("guest may not moderate", () => {
    expect(canModeratePost(guest, post("public", ""))).toBe(false);
  });
});
