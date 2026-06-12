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
    const ac = { id: "grp_ac", status: "active" } as const;
    const other = { id: "grp_other", status: "active" } as const;
    expect(canSeeGroupScope(federal, ac)).toBe(true);
    expect(canSeeGroupScope(federal, other)).toBe(true);
    expect(canSeeGroupScope(localAc, ac)).toBe(true);
    expect(canSeeGroupScope(localAc, other)).toBe(false);
    expect(canSeeGroupScope(member, ac)).toBe(false);
  });

  it("canSeeGroupScope: a local board may NOT manage an archived group; federal still can", () => {
    const acArchived = { id: "grp_ac", status: "archived" } as const;
    expect(canSeeGroupScope(localAc, acArchived)).toBe(false);
    expect(canSeeGroupScope(federal, acArchived)).toBe(true); // federal winds groups down
  });
});
