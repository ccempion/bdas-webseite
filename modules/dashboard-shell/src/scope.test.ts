import { describe, expect, it } from "vitest";

import { boardScopes, type Scope } from "./scope";
import type { Grant } from "@bdas/members";
import type { GroupSummary } from "@bdas/groups";

const groups: GroupSummary[] = [
  { id: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach", city: "MG", status: "active" },
  { id: "grp_ac", slug: "aachen", name: "HG Aachen", city: "Aachen", status: "active" },
];

describe("boardScopes", () => {
  it("federal_board yields the federal scope plus every active group scope", () => {
    const grants: Grant[] = [{ role: "federal_board", groupId: null }];
    const scopes = boardScopes(grants, groups);
    expect(scopes).toEqual<Scope[]>([
      { kind: "federal" },
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
      { kind: "group", groupId: "grp_ac", slug: "aachen", name: "HG Aachen" },
    ]);
  });

  it("a local_board grant yields only that group scope", () => {
    const grants: Grant[] = [{ role: "local_board", groupId: "grp_ac" }];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_ac", slug: "aachen", name: "HG Aachen" },
    ]);
  });

  it("a local_board_lead grant also yields that group scope (a lead boards its group)", () => {
    const grants: Grant[] = [{ role: "local_board_lead", groupId: "grp_mg" }];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
    ]);
  });

  it("a plain member has no board scopes", () => {
    expect(boardScopes([{ role: "member", groupId: null }], groups)).toEqual([]);
  });

  it("de-duplicates when a user holds both local_board and local_board_lead of one group", () => {
    const grants: Grant[] = [
      { role: "local_board", groupId: "grp_mg" },
      { role: "local_board_lead", groupId: "grp_mg" },
    ];
    expect(boardScopes(grants, groups)).toEqual<Scope[]>([
      { kind: "group", groupId: "grp_mg", slug: "moenchengladbach", name: "HG Mönchengladbach" },
    ]);
  });
});
