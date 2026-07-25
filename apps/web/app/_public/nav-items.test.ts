import { describe, expect, it } from "vitest";

import { navItems, type NavItem } from "./nav-items";

function byLabel(items: NavItem[], label: string): NavItem | undefined {
  return items.find((i) => i.label === label);
}

describe("navItems", () => {
  it("omits the group link and Dateien by default", () => {
    const items = navItems();
    expect(byLabel(items, "BDAS Köln")).toBeUndefined();
    expect(byLabel(items, "Dateien")).toBeUndefined();
  });

  it("adds the member's own group as a flat link when myGroup is given", () => {
    const items = navItems({ myGroup: { slug: "koeln", name: "BDAS Köln" } });
    expect(byLabel(items, "BDAS Köln")).toEqual({
      label: "BDAS Köln",
      href: "/gruppen/koeln",
    });
  });

  it("adds a Dateien leaf only when showFiles is true", () => {
    expect(byLabel(navItems({ showFiles: false }), "Dateien")).toBeUndefined();
    expect(byLabel(navItems({ showFiles: true }), "Dateien")).toMatchObject({
      label: "Dateien",
      href: "/dateien",
    });
  });

  it("renders Events as a flat link, and never exposes a management link", () => {
    const prev = process.env["BDAS_FLAG_EVENTS"];
    process.env["BDAS_FLAG_EVENTS"] = "true";

    for (const isLoggedIn of [false, true]) {
      const items = navItems({ isLoggedIn });
      expect(byLabel(items, "Events")).toEqual({ label: "Events", href: "/events" });
      const hrefs = items.flatMap((i) =>
        "children" in i ? i.children.map((c) => c.href) : [i.href],
      );
      expect(hrefs).not.toContain("/admin/events");
      expect(hrefs).not.toContain("/admin/gruppen");
    }

    if (prev === undefined) delete process.env["BDAS_FLAG_EVENTS"];
    else process.env["BDAS_FLAG_EVENTS"] = prev;
  });

  it("shows the Gruppen browse link only to signed-out visitors", () => {
    const prev = process.env["BDAS_FLAG_GROUPS"];
    process.env["BDAS_FLAG_GROUPS"] = "true";

    expect(byLabel(navItems({ isLoggedIn: false }), "Gruppen")).toEqual({
      label: "Gruppen",
      href: "/gruppen",
    });
    expect(byLabel(navItems({ isLoggedIn: true }), "Gruppen")).toBeUndefined();

    if (prev === undefined) delete process.env["BDAS_FLAG_GROUPS"];
    else process.env["BDAS_FLAG_GROUPS"] = prev;
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
