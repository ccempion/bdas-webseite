import { describe, expect, it } from "vitest";

import { render } from "./templates";

describe("render", () => {
  const data = { firstName: "Mara", eventTitle: "Sommerfest" };

  it("registration confirmation greets by name and names the event", () => {
    const out = render("event_registration_confirmed", data);
    expect(out.subject).toContain("Anmeldung");
    expect(out.text).toContain("Mara");
    expect(out.text).toContain("Sommerfest");
    expect(out.html).toContain("Sommerfest");
  });

  it("waitlist notice differs from confirmation", () => {
    const confirmed = render("event_registration_confirmed", data);
    const waitlisted = render("event_waitlisted", data);
    expect(waitlisted.subject).not.toEqual(confirmed.subject);
    expect(waitlisted.subject).toContain("Warteliste");
  });

  it("promotion notice signals a freed seat", () => {
    const out = render("event_waitlist_promoted", data);
    expect(out.subject).toContain("Platz");
    expect(out.text).toContain("Sommerfest");
  });

  it("deregistration confirmation acknowledges cancellation", () => {
    const out = render("event_deregistration_confirmed", data);
    expect(out.subject).toContain("Abmeldung");
  });

  it("escapes HTML in firstName and eventTitle in the html part", () => {
    const out = render("event_registration_confirmed", {
      firstName: "<img src=x onerror=alert(1)>",
      eventTitle: '<a href="https://evil.example">klick</a>',
    });
    expect(out.html).not.toContain("<img");
    expect(out.html).not.toContain("<a href");
    expect(out.html).toContain("&lt;img");
    // text part is plain text (clients do not render it) — left raw
    expect(out.text).toContain("<img");
  });
});
