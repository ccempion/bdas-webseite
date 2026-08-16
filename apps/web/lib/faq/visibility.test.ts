import { describe, expect, it } from "vitest";

import { SECTIONS, type SectionKey } from "../../content/faq";
import type { FaqGrant } from "./order";
import { hasAny, isVisibleTo, narrowSubgroups } from "./visibility";

const grant = (role: FaqGrant["role"], groupId: string | null = null): FaqGrant => ({
  role,
  groupId,
});

/** Mirrors the filter+narrow steps page.tsx runs, without the DB/session
 *  plumbing, so role scenarios can be asserted end-to-end against the real
 *  content. */
function visibleFor(grants: FaqGrant[]): { keys: SectionKey[]; vorstandSubgroupIds: string[] } {
  const keys = (Object.keys(SECTIONS) as SectionKey[]).filter((key) =>
    isVisibleTo(SECTIONS[key].visibleTo, grants),
  );
  const vorstand = keys.includes("vorstand") ? narrowSubgroups(SECTIONS.vorstand, grants) : null;
  return {
    keys,
    vorstandSubgroupIds: vorstand?.subgroups?.map((s) => s.id) ?? [],
  };
}

describe("hasAny", () => {
  it("true when the viewer holds at least one of the listed roles", () => {
    expect(hasAny([grant("local_board", "g1")], ["local_board", "federal_board"])).toBe(true);
  });

  it("false when none of the viewer's grants match", () => {
    expect(hasAny([grant("member")], ["federal_board"])).toBe(false);
    expect(hasAny([], ["federal_board"])).toBe(false);
  });
});

describe("isVisibleTo", () => {
  it("'all' admits every viewer, including one with no grants", () => {
    expect(isVisibleTo("all", [])).toBe(true);
    expect(isVisibleTo("all", [grant("federal_board")])).toBe(true);
  });

  it("a role list defers to hasAny", () => {
    expect(isVisibleTo(["federal_board"], [grant("federal_board")])).toBe(true);
    expect(isVisibleTo(["federal_board"], [grant("member")])).toBe(false);
  });
});

describe("narrowSubgroups", () => {
  it("leaves a section without subgroups untouched", () => {
    expect(narrowSubgroups(SECTIONS.mitglieder, [])).toBe(SECTIONS.mitglieder);
  });

  it("keeps only subgroups the viewer's grants admit", () => {
    const narrowed = narrowSubgroups(SECTIONS.vorstand, [grant("event_organizer", "g1")]);
    expect(narrowed.subgroups?.map((s) => s.id)).toEqual(["event_organizer"]);
  });
});

describe("role-by-role visibility (mirrors page.tsx's filter step)", () => {
  it("a plain member sees only allgemein + mitglieder", () => {
    const { keys, vorstandSubgroupIds } = visibleFor([grant("member")]);
    expect(new Set(keys)).toEqual(new Set(["allgemein", "mitglieder"]));
    expect(vorstandSubgroupIds).toEqual([]);
  });

  it("an alumnus sees only allgemein + mitglieder", () => {
    const { keys } = visibleFor([grant("alumnus")]);
    expect(new Set(keys)).toEqual(new Set(["allgemein", "mitglieder"]));
  });

  it("a pending/inactive member (no grants at all) still sees allgemein + mitglieder", () => {
    // No board grant, and status-implied "member"/"alumnus" only ever gets
    // added for status active/alumnus (roles.ts effectiveGrants) — a pending
    // or inactive member's grants are empty, same as this case. mitglieder is
    // tagged "all" on purpose: it's a help page (profile, events, group
    // change), not a data-access surface, and a pending user needs exactly
    // this content most.
    const { keys, vorstandSubgroupIds } = visibleFor([]);
    expect(new Set(keys)).toEqual(new Set(["allgemein", "mitglieder"]));
    expect(vorstandSubgroupIds).toEqual([]);
  });

  it("federal board alone sees bundesvorstand but NOT vorstand (no local board grant)", () => {
    const { keys, vorstandSubgroupIds } = visibleFor([grant("member"), grant("federal_board")]);
    expect(new Set(keys)).toEqual(new Set(["allgemein", "mitglieder", "bundesvorstand"]));
    expect(vorstandSubgroupIds).toEqual([]);
  });

  it("a plain member never sees bundesvorstand", () => {
    const { keys } = visibleFor([grant("member")]);
    expect(keys).not.toContain("bundesvorstand");
  });

  it("a pure event_organizer sees vorstand, but only the event_organizer subgroup — not LEAD-exclusive content", () => {
    const { keys, vorstandSubgroupIds } = visibleFor([grant("event_organizer", "g1")]);
    expect(keys).toContain("vorstand");
    expect(vorstandSubgroupIds).toEqual(["event_organizer"]);
    expect(vorstandSubgroupIds).not.toContain("local_board_lead");
  });

  it("a pure page_editor sees vorstand, but only the page_editor subgroup", () => {
    const { vorstandSubgroupIds } = visibleFor([grant("page_editor", "g1")]);
    expect(vorstandSubgroupIds).toEqual(["page_editor"]);
  });

  it("a plain local_board sees the baseline subgroup only, not LEAD-exclusive content", () => {
    const { vorstandSubgroupIds } = visibleFor([grant("local_board", "g1")]);
    expect(vorstandSubgroupIds).toEqual(["local_board"]);
  });

  it("a LEAD sees both the baseline subgroup and the LEAD-exclusive one", () => {
    const { vorstandSubgroupIds } = visibleFor([grant("local_board_lead", "g1")]);
    expect(new Set(vorstandSubgroupIds)).toEqual(new Set(["local_board", "local_board_lead"]));
  });

  it("multiple grants see the union of every section/subgroup they admit", () => {
    // Realistic case: an active member (status-implied "member" grant, same
    // as any active user) who additionally holds LEAD and federal grants.
    const { keys, vorstandSubgroupIds } = visibleFor([
      grant("member"),
      grant("local_board_lead", "g1"),
      grant("federal_board"),
    ]);
    expect(new Set(keys)).toEqual(
      new Set(["allgemein", "mitglieder", "bundesvorstand", "vorstand"]),
    );
    expect(new Set(vorstandSubgroupIds)).toEqual(new Set(["local_board", "local_board_lead"]));
  });

  it("federal board sees everything once it also holds a local board grant", () => {
    const { keys, vorstandSubgroupIds } = visibleFor([
      grant("member"),
      grant("federal_board"),
      grant("event_organizer", "g1"),
    ]);
    expect(new Set(keys)).toEqual(
      new Set(["allgemein", "mitglieder", "bundesvorstand", "vorstand"]),
    );
    expect(vorstandSubgroupIds).toEqual(["event_organizer"]);
  });

  it("board grants alone (no member/alumnus grant) still see mitglieder", () => {
    // effectiveGrants adds "member" only for status "active" — independently
    // of any board grant. A federal_board grant in particular is bootstrapped
    // straight from the env allowlist at login (roles.ts), so it's possible
    // to hold it without ever having an active member profile. mitglieder
    // stays visible regardless — see the "all" comment on its visibleTo tag.
    const { keys } = visibleFor([grant("federal_board"), grant("local_board_lead", "g1")]);
    expect(keys).toContain("mitglieder");
  });
});
