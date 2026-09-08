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

// The signup form is a client component: `useFormState` needs Next's action
// context, which a static render has not got. What the footer owns is the
// wiring — that the card is mounted at all, with the right source and the
// guard that keeps it off /newsletter — so the stub reports exactly that.
vi.mock("../_newsletter/NewsletterSignupForm", () => ({
  NewsletterSignupForm: ({ source, hideOnPath }: { source: string; hideOnPath?: string }) =>
    React.createElement("div", {
      "data-newsletter-form": source,
      "data-hide-on-path": hideOnPath,
    }),
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
      showNewsletter={false}
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

  it("links Instagram and LinkedIn as labelled icons, not as legal links", () => {
    const out = view();
    expect(out).toContain('href="https://www.instagram.com/bdas_deutschland/"');
    expect(out).toContain(
      'href="https://www.linkedin.com/showcase/bund-der-alevitischen-studierenden-in-deutschland/about/"',
    );
    expect(out).toContain('alt="Instagram"');
    expect(out).toContain('alt="LinkedIn"');
    expect(out).not.toContain('aria-label="Rechtliches und Social Media"');
  });
  it("renders the newsletter card above the footer when enabled", () => {
    const out = view({ showNewsletter: true });
    expect(out).toContain('data-newsletter-form="footer"');
    // The footer is on /newsletter too, where the page already carries the form.
    expect(out).toContain('data-hide-on-path="/newsletter"');
  });

  it("leaves the footer exactly as it was when the flag is off", () => {
    expect(view()).not.toContain("data-newsletter-form");
  });
});
