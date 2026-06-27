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

  it("closes German quotes with U+201C, not an ASCII straight quote", () => {
    const out = render("event_registration_confirmed", {
      firstName: "Mara",
      eventTitle: "Sommerfest",
    });
    expect(out.text).toContain("„Sommerfest“"); // „Sommerfest"
    expect(out.text).not.toContain('„Sommerfest"'); // not „Sommerfest"
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

  it("organizer-granted names the group and links to management", () => {
    const out = render("event_organizer_granted", {
      firstName: "Mara",
      eventTitle: "",
      eventUrl: "https://dashboard.bdas.de/admin/events",
      groupName: "Aachen",
    });
    expect(out.subject).toContain("Organisator");
    expect(out.text).toContain("Mara");
    expect(out.text).toContain("Aachen");
    expect(out.html).toContain("https://dashboard.bdas.de/admin/events");
  });

  it("organizer-revoked signals the role was removed", () => {
    const out = render("event_organizer_revoked", {
      firstName: "Mara",
      eventTitle: "",
      groupName: "Aachen",
    });
    expect(out.subject).toContain("entzogen");
    expect(out.text).toContain("Aachen");
  });
});

describe("render — event manage/cancel link", () => {
  const url = "https://dashboard.bdas.de/events/evt_123";

  it("adds the event link to the registration confirmation", () => {
    const out = render("event_registration_confirmed", {
      firstName: "Mara",
      eventTitle: "Sommerfest",
      eventUrl: url,
    });
    expect(out.text).toContain(url);
    expect(out.text).toContain("abmelden");
    expect(out.html).toContain(`href="${url}"`);
  });

  it("adds the link to waitlisted and waitlist-promoted emails", () => {
    for (const t of ["event_waitlisted", "event_waitlist_promoted"] as const) {
      const out = render(t, { firstName: "Mara", eventTitle: "Sommerfest", eventUrl: url });
      expect(out.text).toContain(url);
    }
  });

  it("omits the link on the deregistration confirmation (already left)", () => {
    const out = render("event_deregistration_confirmed", {
      firstName: "Mara",
      eventTitle: "Sommerfest",
      eventUrl: url,
    });
    expect(out.text).not.toContain(url);
    expect(out.html).not.toContain("href=");
  });

  it("omits the link when no eventUrl is supplied", () => {
    const out = render("event_registration_confirmed", {
      firstName: "Mara",
      eventTitle: "Sommerfest",
    });
    expect(out.html).not.toContain("href=");
  });
});
