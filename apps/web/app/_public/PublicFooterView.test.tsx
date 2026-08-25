import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/image cannot render here: Vite resolves the logo import to a URL string
// and next/image then demands an explicit width. The logo is not what these
// tests are about.
vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) =>
    React.createElement("img", { alt, className }),
}));

import { PublicFooterView } from "./PublicFooterView";

const view = (props: Partial<Parameters<typeof PublicFooterView>[0]> = {}) =>
  renderToStaticMarkup(
    <PublicFooterView
      privacyUrl="/datenschutz"
      imprintUrl="/impressum"
      termsUrl="/nutzungsbedingungen"
      showEvents={false}
      showGroups={false}
      showFaq={false}
      {...props}
    />,
  );

describe("PublicFooterView", () => {
  it("always shows the legal links it is given", () => {
    const out = view();
    expect(out).toContain('href="/datenschutz"');
    expect(out).toContain('href="/impressum"');
    expect(out).toContain('href="/nutzungsbedingungen"');
  });

  it("respects a custom legal URL set", () => {
    const out = view({
      privacyUrl: "/legal/privacy",
      imprintUrl: "/legal/imprint",
      termsUrl: "/legal/terms",
    });
    expect(out).toContain('href="/legal/privacy"');
    expect(out).toContain('href="/legal/imprint"');
    expect(out).toContain('href="/legal/terms"');
  });

  it("hides Events and Gruppen when both flags are off", () => {
    const out = view();
    expect(out).not.toContain('href="/events"');
    expect(out).not.toContain('href="/gruppen"');
  });

  it("shows each of Events and Gruppen independently", () => {
    expect(view({ showEvents: true })).toContain('href="/events"');
    expect(view({ showEvents: true })).not.toContain('href="/gruppen"');
    expect(view({ showGroups: true })).toContain('href="/gruppen"');
    expect(view({ showGroups: true })).not.toContain('href="/events"');
  });

  it("renders one contentinfo landmark", () => {
    expect(view().match(/<footer/g)?.length).toBe(1);
  });

  it("shows the FAQ link only when showFaq is true", () => {
    expect(view()).not.toContain('href="/faq"');
    expect(view({ showFaq: true })).toContain('href="/faq"');
  });
});
