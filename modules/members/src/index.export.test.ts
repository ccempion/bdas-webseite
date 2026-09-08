import { describe, expect, it } from "vitest";

import { canGrantLocalRoles, canManageGroup, isFederalBoard, isRole } from "./index";
import type { Grant } from "./index";

describe("members public role primitives", () => {
  const federal: Grant[] = [{ role: "federal_board", groupId: null }];
  const leadMuc: Grant[] = [{ role: "local_board_lead", groupId: "grp_muc" }];

  it("isFederalBoard is true only with a federal_board grant", () => {
    expect(isFederalBoard(federal)).toBe(true);
    expect(isFederalBoard(leadMuc)).toBe(false);
  });

  it("canManageGroup: federal manages any group; a Lead only its own group (ADR 0013)", () => {
    expect(canManageGroup(federal, "grp_xyz")).toBe(true);
    expect(canManageGroup(leadMuc, "grp_muc")).toBe(true);
    expect(canManageGroup(leadMuc, "grp_other")).toBe(false);
    expect(canManageGroup(leadMuc, null)).toBe(false);
  });

  it("isRole accepts local_board_lead, file_manager, and blogger; rejects the retired local_board", () => {
    // isRole is re-exported from the module surface.
    expect(isRole("local_board_lead")).toBe(true);
    expect(isRole("file_manager")).toBe(true);
    expect(isRole("blogger")).toBe(true);
    expect(isRole("local_board")).toBe(false);
    expect(isRole("not_a_role")).toBe(false);
  });

  it("canGrantLocalRoles: federal anywhere; a lead only its own group", () => {
    expect(canGrantLocalRoles(federal, "grp_xyz")).toBe(true); // federal: any group
    expect(canGrantLocalRoles(leadMuc, "grp_muc")).toBe(true); // lead of this group
    expect(canGrantLocalRoles(leadMuc, "grp_other")).toBe(false); // lead, wrong group
    expect(canGrantLocalRoles(leadMuc, null)).toBe(false); // unscoped is never delegable
  });
});
