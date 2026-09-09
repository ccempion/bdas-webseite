import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

// Both children are client components built on `useFormState`, which throws
// outside an action context — the lesson from PR 3's first test run. What this
// file covers is the branching, so the children are stood in for by markers.
vi.mock("./NewsletterSignupForm", () => ({
  NewsletterSignupForm: (props: { variant?: string }) => (
    <div data-stub="signup-form" data-variant={props.variant} />
  ),
}));
vi.mock("./NewsletterOneClick", () => ({
  NewsletterOneClick: () => <div data-stub="one-click" />,
}));

import { NewsletterOffer } from "./NewsletterOffer";

const render = (state: "guest" | "member" | "done" | "off") =>
  renderToStaticMarkup(
    <NewsletterOffer state={state} source="puck_block" sourcePath="/ueber-uns" />,
  );

describe("NewsletterOffer", () => {
  it("offers the public field to a visitor who is not signed in", () => {
    const html = render("guest");
    expect(html).toContain('data-stub="signup-form"');
    expect(html).not.toContain('data-stub="one-click"');
  });

  it("uses the quiet variant — the brand-red H1 shape belongs to the footer", () => {
    expect(render("guest")).toContain('data-variant="plain"');
  });

  it("offers the one-click button to a signed-in account that is not subscribed", () => {
    const html = render("member");
    expect(html).toContain('data-stub="one-click"');
    expect(html).not.toContain('data-stub="signup-form"');
  });

  it("shows nothing once the question has been answered", () => {
    expect(render("done")).toBe("");
  });

  it("shows nothing at all with the flag off", () => {
    expect(render("off")).toBe("");
  });
});
