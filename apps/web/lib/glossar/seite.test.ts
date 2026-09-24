import { describe, expect, it } from "vitest";

import type { Grant } from "@bdas/members";

import { GLOSSAR } from "./eintraege";
import { glossarFuer, istVorstand } from "./seite";

const member: Grant[] = [{ role: "member", groupId: null }];
const lead: Grant[] = [{ role: "local_board_lead", groupId: "grp_1" }];
const federal: Grant[] = [{ role: "federal_board", groupId: null }];

const all = (m: ReturnType<typeof glossarFuer>) => [...m.values()].flat();

describe("glossarFuer", () => {
  it("hides board-only terms from members and signed-out viewers", () => {
    for (const grants of [[], member]) {
      const shown = all(glossarFuer(grants));
      expect(shown.some((e) => e.nurFuer === "vorstand")).toBe(false);
      expect(shown.length).toBe(GLOSSAR.filter((e) => !e.nurFuer).length);
    }
  });

  it("shows every term to Leads and the federal board", () => {
    expect(istVorstand(lead)).toBe(true);
    expect(istVorstand(federal)).toBe(true);
    expect(all(glossarFuer(lead))).toHaveLength(GLOSSAR.length);
  });

  it("sorts each area A–Z", () => {
    for (const list of glossarFuer(federal).values()) {
      const names = list.map((e) => e.begriff);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "de")));
    }
  });
});
