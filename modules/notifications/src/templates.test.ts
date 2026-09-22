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

  it("account deletion requested names the purge date and includes the reactivation link", () => {
    const out = render("account_deletion_requested", {
      ...data,
      scheduledPurgeDate: "22. Oktober 2026",
      reactivationUrl: "https://bdas.de/konto-reaktivieren/abc123",
    });
    expect(out.subject).toContain("Löschung");
    expect(out.text).toContain("Mara");
    expect(out.text).toContain("22. Oktober 2026");
    expect(out.text).toContain("https://bdas.de/konto-reaktivieren/abc123");
  });

  it("account deletion requested omits the link section when none is given", () => {
    const out = render("account_deletion_requested", {
      ...data,
      scheduledPurgeDate: "22. Oktober 2026",
    });
    expect(out.text).not.toContain("http");
  });

  it("data export ready points to the attachment, not a link", () => {
    const out = render("data_export_ready", data);
    expect(out.subject).toContain("Datenauskunft");
    expect(out.text).toContain("Anhang");
  });

  it("account deletion completed has no action link", () => {
    const out = render("account_deletion_completed", data);
    expect(out.subject).toContain("gelöscht");
    expect(out.text).not.toContain("http");
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

  it("puts the rejection reason in the decline email", () => {
    const out = render("member_application_declined", {
      firstName: "Anna",
      eventTitle: "",
      reasonCategoryLabel: "Kein Kontakt zustande gekommen",
      reasonMessage: "Wir haben dich dreimal nicht erreicht.",
    });
    expect(out.text).toContain("Kein Kontakt zustande gekommen");
    expect(out.text).toContain("Wir haben dich dreimal nicht erreicht.");
  });

  it("omits the message line when the board wrote none", () => {
    const out = render("member_application_declined", {
      firstName: "Anna",
      eventTitle: "",
      reasonCategoryLabel: "Kein Student mehr",
    });
    expect(out.text).toContain("Kein Student mehr");
    expect(out.text).not.toContain("undefined");
  });

  it("tells a dissolved group's applicants they were not rejected", () => {
    const out = render("member_application_group_dissolved", {
      firstName: "Anna",
      eventTitle: "",
      groupName: "BDAS Aachen",
    });
    expect(out.text).toContain("aufgelöst");
    expect(out.text).not.toMatch(/abgelehnt|nicht angenommen/);
  });

  it("confirms an accepted group change with the destination group's name", () => {
    const out = render("member_group_change_approved", {
      firstName: "Anna",
      eventTitle: "",
      groupName: "BDAS Aachen",
    });
    expect(out.text).toContain("BDAS Aachen");
    expect(out.text).not.toMatch(/aufgenommen|willkommen/);
  });

  it("puts the rejection reason in the group-change decline email", () => {
    const out = render("member_group_change_declined", {
      firstName: "Anna",
      eventTitle: "",
      reasonCategoryLabel: "Kein Kontakt zustande gekommen",
      reasonMessage: "Wir haben dich dreimal nicht erreicht.",
    });
    expect(out.text).toContain("Kein Kontakt zustande gekommen");
    expect(out.text).toContain("Wir haben dich dreimal nicht erreicht.");
    expect(out.text).not.toContain("Bewerbung");
  });

  it("alerts on a password change", () => {
    const out = render("password_changed_notice", { firstName: "Anna", eventTitle: "" });
    expect(out.subject).toContain("Passwort");
    expect(out.text).toContain("geändert");
  });

  it("distinguishes a password reset from a password change", () => {
    const out = render("password_reset_notice", { firstName: "Anna", eventTitle: "" });
    expect(out.subject).toContain("zurückgesetzt");
    expect(out.text).toContain("Passwort vergessen");
  });

  it("names the new address in the email-change notice", () => {
    const out = render("email_changed_notice", {
      firstName: "Anna",
      eventTitle: "",
      newEmail: "neu@example.org",
    });
    expect(out.text).toContain("neu@example.org");
  });
});

describe("newsletter templates", () => {
  it("renders the confirmation mail with the link and no name", () => {
    const mail = render("newsletter_confirm", {
      firstName: "",
      eventTitle: "",
      confirmUrl: "https://bdas.de/newsletter/bestaetigen?token=abc",
      unsubscribeUrl: "https://bdas.de/newsletter/abmelden?token=xyz",
    });

    expect(mail.subject).toBe("BDAS: Bitte bestätige deine Anmeldung");
    // An anonymous signup has no name, so the salutation stays nameless —
    // "Hallo Gast" (what sendTransactionalToGuest would default to) reads worse
    // than no name at all.
    expect(mail.text).toContain("Hallo,");
    expect(mail.text).not.toContain("Hallo Gast");
    expect(mail.text).toContain("https://bdas.de/newsletter/bestaetigen?token=abc");
    expect(mail.html).toContain("https://bdas.de/newsletter/bestaetigen?token=abc");
    // Seven days is the token lifetime from spec §4 — say so in the mail.
    expect(mail.text).toContain("sieben Tage");
    // This mail is the only one an anonymous address ever gets, so it has to
    // carry the way out too — otherwise /newsletter/abmelden is unreachable.
    expect(mail.text).toContain("https://bdas.de/newsletter/abmelden?token=xyz");
    expect(mail.html).toContain("https://bdas.de/newsletter/abmelden?token=xyz");
  });

  it("renders the already-subscribed mail with the unsubscribe link", () => {
    const mail = render("newsletter_already_subscribed", {
      firstName: "",
      eventTitle: "",
      unsubscribeUrl: "https://bdas.de/newsletter/abmelden",
    });

    expect(mail.subject).toBe("BDAS: Du bist schon dabei");
    expect(mail.text).not.toContain("Hallo Gast");
    expect(mail.text).toContain("https://bdas.de/newsletter/abmelden");
  });

  it("escapes a hostile url instead of letting it into the markup", () => {
    const mail = render("newsletter_confirm", {
      firstName: "",
      eventTitle: "",
      confirmUrl: 'https://bdas.de/x?a="><script>alert(1)</script>',
    });
    expect(mail.html).not.toContain("<script>");
  });
});

describe("acceptance per user type", () => {
  const who = { firstName: "Mara", eventTitle: "" };

  it("welcomes a supporter into the network, not into a local group", () => {
    const out = render("member_supporter_approved", who);
    expect(out.subject).toBe("BDAS: Willkommen im Netzwerk");
    expect(out.text).toContain("Bundesvorstand");
    expect(out.text).not.toContain("lokaler Vorstand");
  });

  it("names the partner organisation", () => {
    const out = render("member_partner_approved", { ...who, groupName: "BDAJ" });
    expect(out.subject).toBe("BDAS: Dein Zugang ist freigeschaltet");
    expect(out.text).toContain("BDAJ");
    expect(render("member_partner_approved", who).text).toContain("deine Partnerorganisation");
  });

  it("welcomes an alumnus", () => {
    const out = render("member_alumnus_approved", who);
    expect(out.subject).toBe("BDAS: Willkommen bei den Alumni");
    expect(out.text).toContain("Alumna oder Alumnus");
  });

  it("links to the account when a URL is given", () => {
    const out = render("member_alumnus_approved", {
      ...who,
      accountUrl: "https://bdas.de/account",
    });
    expect(out.text).toContain("https://bdas.de/account");
    expect(out.html).toContain('href="https://bdas.de/account"');
  });

  it("differs from the student text", () => {
    const student = render("member_application_approved", who).subject;
    for (const t of [
      "member_supporter_approved",
      "member_partner_approved",
      "member_alumnus_approved",
    ] as const) {
      expect(render(t, who).subject).not.toBe(student);
    }
  });
});
