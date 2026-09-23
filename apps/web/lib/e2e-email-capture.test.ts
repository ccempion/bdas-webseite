import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Notifier, OutboundEmail } from "@bdas/notifications";

import { e2eEmailCaptureEnabled, getCapturedEmail, withE2ECapture } from "./e2e-email-capture";

const ORIGINAL_ENV = { ...process.env };

describe("e2e email capture", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("e2eEmailCaptureEnabled", () => {
    it("is false with no env vars set", () => {
      delete process.env["E2E_EMAIL_CAPTURE"];
      delete process.env["VERCEL_ENV"];
      expect(e2eEmailCaptureEnabled()).toBe(false);
    });

    it("is true when the capture flag is on and it's not production", () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      expect(e2eEmailCaptureEnabled()).toBe(true);
    });

    it("is false in production even with the capture flag on", () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      process.env["VERCEL_ENV"] = "production";
      expect(e2eEmailCaptureEnabled()).toBe(false);
    });
  });

  describe("withE2ECapture", () => {
    let sent: OutboundEmail[];
    let inner: Notifier;

    beforeEach(() => {
      sent = [];
      inner = {
        async send(email: OutboundEmail): Promise<void> {
          sent.push(email);
        },
      };
    });

    it("passes sends through to the wrapped notifier unchanged when disabled", async () => {
      delete process.env["E2E_EMAIL_CAPTURE"];
      const wrapped = withE2ECapture(inner);
      const email = { to: "a@example.org", subject: "s", text: "t", html: "<p>t</p>" };

      await wrapped.send(email);

      expect(sent).toEqual([email]);
      expect(getCapturedEmail("a@example.org")).toBeUndefined();
    });

    it("captures the email by recipient and still forwards it when enabled", async () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      const wrapped = withE2ECapture(inner);
      const email = { to: "B@Example.org", subject: "s", text: "t", html: "<p>t</p>" };

      await wrapped.send(email);

      expect(sent).toEqual([email]);
      expect(getCapturedEmail("b@example.org")).toEqual(email);
    });

    it("keeps only the most recent email per recipient", async () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      const wrapped = withE2ECapture(inner);
      await wrapped.send({ to: "a@example.org", subject: "first", text: "t", html: "<p>t</p>" });
      await wrapped.send({ to: "a@example.org", subject: "second", text: "t", html: "<p>t</p>" });

      expect(getCapturedEmail("a@example.org")?.subject).toBe("second");
    });
  });
});
