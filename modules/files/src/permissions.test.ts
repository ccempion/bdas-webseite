import { describe, expect, it } from "vitest";

import type { CurrentMember, Grant, Member } from "@bdas/members";

import { canRead, canWrite } from "./permissions";
import { canReadFolder, canWriteFolder } from "./index";
import type { Folder } from "./types";

function folder(scope: Folder["scope"], groupId: string | null): Folder {
  return {
    id: "fld_x",
    slug: "x",
    name: "X",
    scope,
    groupId,
    parentId: null,
    depth: 0,
    description: "",
    createdAt: new Date(),
    createdBy: null,
  };
}

function member(over: Partial<Member> = {}): Member {
  return {
    id: "mbr_1",
    userId: "usr_1",
    firstName: "T",
    lastName: "M",
    primaryGroupId: "grp_muc",
    status: "active",
    joinedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function me(grants: Grant[], m: Member | null = member()): CurrentMember {
  return {
    user: { id: "usr_1", email: "t@x.org", status: "active", roles: [], sessionId: "ses_1" },
    member: m,
    grants,
  };
}

const FED: Grant[] = [{ role: "federal_board", groupId: null }];
const LEAD_MUC: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];
const FILE_MGR_MUC: Grant[] = [{ role: "file_manager", groupId: "grp_muc" }];
const PLAIN: Grant[] = [{ role: "member", groupId: null }];

describe("canRead", () => {
  it("members_all: any active member, not inactive", () => {
    expect(canRead(folder("members_all", null), me(PLAIN))).toBe(true);
    expect(canRead(folder("members_all", null), me(PLAIN, member({ status: "inactive" })))).toBe(
      false,
    );
  });

  it("group_members: only active members of that group", () => {
    expect(canRead(folder("group_members", "grp_muc"), me(PLAIN))).toBe(true);
    expect(canRead(folder("group_members", "grp_other"), me(PLAIN))).toBe(false);
  });

  it("local_board: that group's board or federal", () => {
    expect(canRead(folder("local_board", "grp_muc"), me(LEAD_MUC))).toBe(true);
    expect(canRead(folder("local_board", "grp_muc"), me(FED))).toBe(true);
    expect(canRead(folder("local_board", "grp_muc"), me(PLAIN))).toBe(false);
  });

  it("federal_board: only federal", () => {
    expect(canRead(folder("federal_board", null), me(FED))).toBe(true);
    expect(canRead(folder("federal_board", null), me(LEAD_MUC))).toBe(false);
  });
});

describe("canWrite", () => {
  it("members_all + federal_board: federal only", () => {
    expect(canWrite(folder("members_all", null), me(FED))).toBe(true);
    expect(canWrite(folder("members_all", null), me(PLAIN))).toBe(false);
    expect(canWrite(folder("federal_board", null), me(FED))).toBe(true);
    expect(canWrite(folder("federal_board", null), me(LEAD_MUC))).toBe(false);
  });

  it("group_members + local_board: that group's board (federal too)", () => {
    expect(canWrite(folder("group_members", "grp_muc"), me(LEAD_MUC))).toBe(true);
    expect(canWrite(folder("local_board", "grp_muc"), me(LEAD_MUC))).toBe(true);
    expect(canWrite(folder("group_members", "grp_muc"), me(FED))).toBe(true);
    expect(canWrite(folder("group_members", "grp_muc"), me(PLAIN))).toBe(false);
  });

  describe("file_manager (local role redesign)", () => {
    it("writes the group_members folder of its own group", () => {
      expect(canWrite(folder("group_members", "grp_muc"), me(FILE_MGR_MUC))).toBe(true);
    });

    it("does NOT write another group's group_members folder", () => {
      expect(canWrite(folder("group_members", "grp_other"), me(FILE_MGR_MUC))).toBe(false);
    });

    it("does NOT write the local_board (board-internal) folder of its own group", () => {
      expect(canWrite(folder("local_board", "grp_muc"), me(FILE_MGR_MUC))).toBe(false);
    });

    it("does NOT write members_all or federal_board scope", () => {
      expect(canWrite(folder("members_all", null), me(FILE_MGR_MUC))).toBe(false);
      expect(canWrite(folder("federal_board", null), me(FILE_MGR_MUC))).toBe(false);
    });

    it("can still read the group_members folder — read access is unaffected", () => {
      expect(canRead(folder("group_members", "grp_muc"), me(FILE_MGR_MUC))).toBe(true);
    });

    it("cannot read the local_board (board-internal) folder — file_manager is not a board grant", () => {
      expect(canRead(folder("local_board", "grp_muc"), me(FILE_MGR_MUC))).toBe(false);
    });
  });
});

describe("public folder predicates (re-exported)", () => {
  it("canReadFolder / canWriteFolder match the internal predicates", () => {
    const f = folder("local_board", "grp_muc");
    expect(canReadFolder(f, me(LEAD_MUC))).toBe(true);
    expect(canWriteFolder(f, me(LEAD_MUC))).toBe(true);
  });

  it("a plain member can neither read nor write a local_board folder", () => {
    const f = folder("local_board", "grp_muc");
    expect(canReadFolder(f, me(PLAIN))).toBe(false);
    expect(canWriteFolder(f, me(PLAIN))).toBe(false);
  });
});
