import { describe, expect, it } from "vitest";

import { canAdministerBoard, canSeeFederalScope, canSeeGroupScope } from "./access";
import type { Grant } from "@bdas/members";

const federal: Grant[] = [{ role: "federal_board", groupId: null }];
const localAc: Grant[] = [{ role: "local_board", groupId: "grp_ac" }];
const member: Grant[] = [{ role: "member", groupId: null }];

describe("board access predicates", () => {
  it("canAdministerBoard: any board grant qualifies; a plain member does not", () => {
    expect(canAdministerBoard(federal)).toBe(true);
    expect(canAdministerBoard(localAc)).toBe(true);
    expect(canAdministerBoard(member)).toBe(false);
    expect(canAdministerBoard([])).toBe(false);
  });

  it("canSeeFederalScope: only federal_board", () => {
    expect(canSeeFederalScope(federal)).toBe(true);
    expect(canSeeFederalScope(localAc)).toBe(false);
  });

  it("canSeeGroupScope: federal sees any group; local only its own", () => {
    expect(canSeeGroupScope(federal, "grp_ac")).toBe(true);
    expect(canSeeGroupScope(federal, "grp_other")).toBe(true);
    expect(canSeeGroupScope(localAc, "grp_ac")).toBe(true);
    expect(canSeeGroupScope(localAc, "grp_other")).toBe(false);
    expect(canSeeGroupScope(member, "grp_ac")).toBe(false);
  });
});
