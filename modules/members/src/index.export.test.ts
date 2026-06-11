import { describe, expect, it } from "vitest";

import { canManageGroup, isFederalBoard } from "./index";
import type { Grant } from "./index";

describe("members public role primitives", () => {
  const federal: Grant[] = [{ role: "federal_board", groupId: null }];
  const localMuc: Grant[] = [{ role: "local_board", groupId: "grp_muc" }];

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
});
