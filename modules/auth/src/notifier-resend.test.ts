import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createResendNotifier } from "./notifier-resend";

describe("auth createResendNotifier", () => {
  beforeEach(() => sendMock.mockReset());

  it("throws when Resend returns an error result", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(
      notifier.send({ kind: "verify", to: "x@example.org", verifyUrl: "https://e/v" }),
    ).rejects.toThrow("domain not verified");
  });

  it("resolves when Resend returns a success result", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(
      notifier.send({ kind: "reset", to: "x@example.org", resetUrl: "https://e/r" }),
    ).resolves.toBeUndefined();
  });

  it("renders the password-changed mail with no link in it", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });

    await notifier.send({ kind: "changed", to: "x@example.org" });

    const arg = sendMock.mock.calls[0]?.[0];
    expect(arg.subject).toBe("BDAS — Passwort geändert");
    expect(arg.text).toContain("geändert");
    // A tripwire mail also reaches an attacker who already holds the account;
    // it must not hand them a link that does anything.
    expect(arg.html).not.toContain("<a ");
  });

  it("renders the email-change-verify mail with the confirm link", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });

    await notifier.send({
      kind: "email-change-verify",
      to: "neu@example.org",
      confirmUrl: "https://e/c",
    });

    const arg = sendMock.mock.calls[0]?.[0];
    expect(arg.subject).toBe("BDAS — Neue E-Mail-Adresse bestätigen");
    expect(arg.html).toContain("https://e/c");
  });

  it("renders the email-change-notice mail with no link in it", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });

    await notifier.send({
      kind: "email-change-notice",
      to: "alt@example.org",
      newEmail: "neu@example.org",
    });

    const arg = sendMock.mock.calls[0]?.[0];
    expect(arg.subject).toBe("BDAS — Änderung der Login-E-Mail angefordert");
    expect(arg.text).toContain("neu@example.org");
    // Same tripwire reasoning as the password-changed mail.
    expect(arg.html).not.toContain("<a ");
  });
});
