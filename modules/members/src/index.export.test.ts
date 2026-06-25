import { describe, expect, it } from "vitest";

import { canGrantLocalBoard, canManageGroup, isFederalBoard, isRole } from "./index";
import type { Grant } from "./index";

describe("members public role primitives", () => {
  const federal: Grant[] = [{ role: "federal_board", groupId: null }];
  const localMuc: Grant[] = [{ role: "local_board", groupId: "grp_muc" }];
  const leadMuc: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];

  it("isFederalBoard is true only with a federal_board grant", () => {
    expect(isFederalBoard(federal)).toBe(true);
    expect(isFederalBoard(localMuc)).toBe(false);
  });

  it("canManageGroup: federal manages any group; local only its own", () => {
    expect(canManageGroup(federal, "grp_xyz")).toBe(true);
    expect(canManageGroup(localMuc, "grp_muc")).toBe(true);
    expect(canManageGroup(localMuc, "grp_other")).toBe(false);
    expect(canManageGroup(localMuc, null)).toBe(false);
  });

  it("canManageGroup: a lead manages its own group (ADR 0013), not others", () => {
    expect(canManageGroup(leadMuc, "grp_muc")).toBe(true);
    expect(canManageGroup(leadMuc, "grp_other")).toBe(false);
    expect(canManageGroup(leadMuc, null)).toBe(false);
  });

  it("isRole accepts local_board_lead", () => {
    // isRole is re-exported from the module surface.
    expect(isRole("local_board_lead")).toBe(true);
    expect(isRole("not_a_role")).toBe(false);
  });

  it("canGrantLocalBoard: federal anywhere; a lead only its own group", () => {
    const lead: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];
    expect(canGrantLocalBoard(federal, "grp_xyz")).toBe(true); // federal: any group
    expect(canGrantLocalBoard(lead, "grp_muc")).toBe(true); // lead of this group
    expect(canGrantLocalBoard(lead, "grp_other")).toBe(false); // lead, wrong group
    expect(canGrantLocalBoard(lead, null)).toBe(false); // unscoped is never delegable
    expect(canGrantLocalBoard(localMuc, "grp_muc")).toBe(false); // plain local_board ≠ lead
  });
});
