import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/image cannot render here: Vite resolves BrandLink's logo import to a URL
// string and next/image then demands an explicit width. The logo is not what
// these tests are about.
vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) =>
    React.createElement("img", { alt, className }),
}));

import { navItems } from "./nav-items";
import { PublicHeaderView } from "./PublicHeaderView";

const visitor = () => <PublicHeaderView items={navItems({ isLoggedIn: false })} konto={null} />;

describe("PublicHeaderView", () => {
  it("renders one banner landmark", () => {
    const out = renderToStaticMarkup(visitor());
    expect(out.match(/<header/g)?.length).toBe(1);
  });

  it("shows the visitor's entries, not an account menu", () => {
    const out = renderToStaticMarkup(visitor());
    expect(out).toContain("Mitglied werden");
    expect(out).toContain("Anmelden");
    expect(out).not.toContain("Mein Konto");
    expect(out).not.toContain("Abmelden");
  });

  it("renders every nav item it is given", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView
        items={[
          { label: "Unsere Arbeit", href: "/unsere-arbeit" },
          { label: "Über uns", children: [{ label: "Kurzportrait", href: "/ueber-uns" }] },
        ]}
        konto={null}
      />,
    );
    expect(out).toContain("Unsere Arbeit");
    expect(out).toContain("Über uns");
    expect(out).toContain('href="/ueber-uns"');
  });

  it("shows the account menu and approvals count for a signed-in board member", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView items={[]} konto={{ displayName: "Aylin", isBoard: true, openCount: 3 }} />,
    );
    expect(out).toContain("Aylin");
    expect(out).toContain("Mein Konto");
    expect(out).toContain("Board-Bereich");
    expect(out).toContain("Abmelden");
    expect(out).not.toContain("Mitglied werden");
  });

  it("hides the Board-Bereich entry from a non-board member", () => {
    const out = renderToStaticMarkup(
      <PublicHeaderView
        items={[]}
        konto={{ displayName: "Deniz", isBoard: false, openCount: 0 }}
      />,
    );
    expect(out).toContain("Mein Konto");
    expect(out).not.toContain("Board-Bereich");
  });
});
