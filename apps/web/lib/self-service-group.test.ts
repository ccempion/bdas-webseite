import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupKind } from "@bdas/groups";

const kinds: Record<string, GroupKind> = {
  grp_hs: "hochschulgruppe",
  grp_nw: "netzwerk",
  grp_af: "affiliate",
};
const getGroupKind = vi.fn(async (_db: unknown, id: string) => kinds[id] ?? null);

vi.mock("@bdas/groups", () => ({
  getGroupKind: (db: unknown, id: string) => getGroupKind(db, id),
}));

import { requireSelfServiceGroup, selfServiceGroups } from "./self-service-group";

const db = {} as Parameters<typeof requireSelfServiceGroup>[0];

beforeEach(() => getGroupKind.mockClear());

describe("requireSelfServiceGroup", () => {
  it("lässt eine Hochschulgruppe und den Austritt zu", async () => {
    await expect(requireSelfServiceGroup(db, "grp_hs", null)).resolves.toBeUndefined();
    await expect(requireSelfServiceGroup(db, null, "grp_hs")).resolves.toBeUndefined();
  });

  it("verweigert Netzwerk und Partnergruppen als selbst gewähltes Ziel (Spec 2026-09-16 §5.6)", async () => {
    await expect(requireSelfServiceGroup(db, "grp_nw", null)).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { primaryGroupId: expect.any(String) },
    });
    await expect(requireSelfServiceGroup(db, "grp_af", "grp_hs")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("lässt die aktuelle Gruppe stehen, damit ein Förderer sein Profil speichern kann", async () => {
    await expect(requireSelfServiceGroup(db, "grp_nw", "grp_nw")).resolves.toBeUndefined();
    expect(getGroupKind).not.toHaveBeenCalled();
  });

  it("überlässt eine unbekannte ID dem Fremdschlüssel", async () => {
    await expect(requireSelfServiceGroup(db, "grp_nope", null)).resolves.toBeUndefined();
  });
});

describe("selfServiceGroups", () => {
  const groups = [
    { id: "grp_hs", kind: "hochschulgruppe" as const },
    { id: "grp_nw", kind: "netzwerk" as const },
    { id: "grp_af", kind: "affiliate" as const },
  ];

  it("bietet nur Hochschulgruppen an", () => {
    expect(selfServiceGroups(groups, null).map((g) => g.id)).toEqual(["grp_hs"]);
  });

  it("behält die aktuelle Gruppe, auch wenn sie keine Hochschulgruppe ist", () => {
    expect(selfServiceGroups(groups, "grp_nw").map((g) => g.id)).toEqual(["grp_hs", "grp_nw"]);
  });
});
