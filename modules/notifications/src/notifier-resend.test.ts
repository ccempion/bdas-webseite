import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createResendNotifier } from "./notifier-resend";

const email = {
  to: "x@example.org",
  subject: "Betreff",
  text: "Hallo",
  html: "<p>Hallo</p>",
} as const;

describe("createResendNotifier", () => {
  beforeEach(() => sendMock.mockReset());

  it("throws when Resend returns an error result", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(notifier.send(email)).rejects.toThrow("domain not verified");
  });

  it("resolves when Resend returns a success result", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(notifier.send(email)).resolves.toBeUndefined();
  });
});
