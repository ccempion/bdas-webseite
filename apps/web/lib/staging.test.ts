import { afterEach, describe, expect, it, vi } from "vitest";

import { hasStagingPassword, isStaging, stagingSafeNotifier } from "./staging";

const ORIGINAL_ENV = { ...process.env };

function basic(credentials: string): string {
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}

type Mail = { to: string; subject: string; text: string };
type AuthMail = { kind: "verify"; to: string; verifyUrl: string };

function recorder<T extends { to: string }>() {
  const sent: T[] = [];
  return { sent, notifier: { send: vi.fn(async (m: T) => void sent.push(m)) } };
}

describe("staging", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is staging only on Vercel preview deployments", () => {
    process.env["VERCEL_ENV"] = "preview";
    expect(isStaging()).toBe(true);
    process.env["VERCEL_ENV"] = "production";
    expect(isStaging()).toBe(false);
    delete process.env["VERCEL_ENV"];
    expect(isStaging()).toBe(false);
  });

  it("passes the notifier through unchanged outside staging", () => {
    process.env["VERCEL_ENV"] = "production";
    process.env["EMAIL_REDIRECT_TO"] = "test@example.org";
    const real = recorder<Mail>();
    const fallback = recorder<Mail>();
    expect(stagingSafeNotifier(real.notifier, fallback.notifier)).toBe(real.notifier);
  });

  it("redirects every mail on staging and tags the subject with the original recipient", async () => {
    process.env["VERCEL_ENV"] = "preview";
    process.env["EMAIL_REDIRECT_TO"] = "test@example.org";
    const real = recorder<Mail>();
    const fallback = recorder<Mail>();

    await stagingSafeNotifier(real.notifier, fallback.notifier).send({
      to: "member@example.org",
      subject: "Willkommen",
      text: "Hallo",
    });

    expect(real.sent).toEqual([
      {
        to: "test@example.org",
        subject: "[Staging → member@example.org] Willkommen",
        text: "Hallo",
      },
    ]);
    expect(fallback.sent).toEqual([]);
  });

  it("redirects subject-less auth messages without adding a subject", async () => {
    process.env["VERCEL_ENV"] = "preview";
    process.env["EMAIL_REDIRECT_TO"] = "test@example.org";
    const real = recorder<AuthMail>();

    await stagingSafeNotifier(real.notifier, recorder<AuthMail>().notifier).send({
      kind: "verify",
      to: "member@example.org",
      verifyUrl: "https://staging.example.org/v",
    });

    expect(real.sent).toEqual([
      { kind: "verify", to: "test@example.org", verifyUrl: "https://staging.example.org/v" },
    ]);
  });

  it("falls back instead of delivering when staging has no redirect target", async () => {
    process.env["VERCEL_ENV"] = "preview";
    delete process.env["EMAIL_REDIRECT_TO"];
    const real = recorder<Mail>();
    const fallback = recorder<Mail>();

    expect(stagingSafeNotifier(real.notifier, fallback.notifier)).toBe(fallback.notifier);
  });

  describe("hasStagingPassword", () => {
    const password = "t3st%='&.^[)x:ü";

    it("accepts the right password with any username", () => {
      expect(hasStagingPassword(basic(`anyone:${password}`), password)).toBe(true);
      expect(hasStagingPassword(basic(`:${password}`), password)).toBe(true);
    });

    it("rejects a wrong, truncated or extended password", () => {
      expect(hasStagingPassword(basic("x:wrong"), password)).toBe(false);
      expect(hasStagingPassword(basic(`x:${password.slice(0, -1)}`), password)).toBe(false);
      expect(hasStagingPassword(basic(`x:${password}x`), password)).toBe(false);
    });

    it("rejects missing, non-Basic and malformed headers", () => {
      expect(hasStagingPassword(null, password)).toBe(false);
      expect(hasStagingPassword(`Bearer ${password}`, password)).toBe(false);
      expect(hasStagingPassword("Basic %%%not-base64", password)).toBe(false);
      expect(hasStagingPassword(basic("no-separator"), password)).toBe(false);
    });
  });
});
