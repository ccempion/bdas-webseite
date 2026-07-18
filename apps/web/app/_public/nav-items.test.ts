import { describe, expect, it } from "vitest";

import { navItems, type NavItem } from "./nav-items";

function byLabel(items: NavItem[], label: string): NavItem | undefined {
  return items.find((i) => i.label === label);
}

describe("navItems", () => {
  it("omits Meine Gruppe and Dateien by default", () => {
    const items = navItems();
    expect(byLabel(items, "Meine Gruppe")).toBeUndefined();
    expect(byLabel(items, "Dateien")).toBeUndefined();
  });

  it("adds a Meine Gruppe dropdown when myGroup is given", () => {
    const items = navItems({ myGroup: { slug: "koeln" } });
    const mg = byLabel(items, "Meine Gruppe");
    expect(mg).toBeDefined();
    expect(mg).toMatchObject({
      label: "Meine Gruppe",
      children: [
        { label: "Übersicht", href: "/gruppen/koeln" },
        { label: "Events", href: "/events?groups=koeln" },
      ],
    });
  });

  it("adds a Dateien leaf only when showFiles is true", () => {
    expect(byLabel(navItems({ showFiles: false }), "Dateien")).toBeUndefined();
    expect(byLabel(navItems({ showFiles: true }), "Dateien")).toMatchObject({
      label: "Dateien",
      href: "/dateien",
    });
  });

  it("renders Events as a flat link for everyone, including federal", () => {
    const prev = process.env["BDAS_FLAG_EVENTS"];
    process.env["BDAS_FLAG_EVENTS"] = "true";

    for (const isFederal of [false, true]) {
      const items = navItems({ isFederal });
      expect(byLabel(items, "Events")).toEqual({ label: "Events", href: "/events" });
    }

    // No management link is ever produced by the nav for events.
    const federal = navItems({ isFederal: true });
    const hrefs = federal.flatMap((i) =>
      "children" in i ? i.children.map((c) => c.href) : [i.href],
    );
    expect(hrefs).not.toContain("/admin/events");

    if (prev === undefined) delete process.env["BDAS_FLAG_EVENTS"];
    else process.env["BDAS_FLAG_EVENTS"] = prev;
  });

  it("adds the BSR page to Über uns only while the content flag is on", () => {
    const prev = process.env["BDAS_FLAG_CONTENT"];

    process.env["BDAS_FLAG_CONTENT"] = "true";
    const on = byLabel(navItems(), "Über uns");
    expect(on && "children" in on ? on.children.map((c) => c.href) : []).toContain(
      "/ueber-uns/bundessprecherinnenrat",
    );

    process.env["BDAS_FLAG_CONTENT"] = "false";
    const off = byLabel(navItems(), "Über uns");
    expect(off && "children" in off ? off.children.map((c) => c.href) : []).not.toContain(
      "/ueber-uns/bundessprecherinnenrat",
    );

    if (prev === undefined) delete process.env["BDAS_FLAG_CONTENT"];
    else process.env["BDAS_FLAG_CONTENT"] = prev;
  });
});
