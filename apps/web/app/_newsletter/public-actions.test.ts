import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.7" : null) }),
}));

const subscribePubliclyMock = vi.fn();
vi.mock("@bdas/newsletter", () => ({
  subscribePublicly: (...a: unknown[]) => subscribePubliclyMock(...a),
}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));

import { HONEYPOT_FIELD } from "./honeypot";
import { subscribePubliclyAction } from "./public-actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("subscribePubliclyAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_NEWSLETTER"] = "true";
    subscribePubliclyMock.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_NEWSLETTER"];
  });

  it("passes the address, the source and the client IP to the module", async () => {
    const state = await subscribePubliclyAction(
      {},
      form({ email: "Neu@Example.org", source: "footer", sourcePath: "/" }),
    );

    expect(state.ok).toBe(true);
    expect(subscribePubliclyMock).toHaveBeenCalledWith(expect.anything(), {
      email: "Neu@Example.org",
      source: "footer",
      sourcePath: "/",
      context: expect.objectContaining({ ip: "203.0.113.7" }),
    });
  });

  it("answers a filled honeypot exactly like a success, but writes nothing", async () => {
    const state = await subscribePubliclyAction(
      {},
      form({ email: "bot@example.org", source: "footer", [HONEYPOT_FIELD]: "http://spam.example" }),
    );

    expect(state.ok).toBe(true);
    expect(subscribePubliclyMock).not.toHaveBeenCalled();
  });

  it("reports an invalid address as a field error, not as success", async () => {
    const { ValidationError } = await import("@bdas/errors");
    subscribePubliclyMock.mockRejectedValue(
      new ValidationError("Bitte gib eine gültige E-Mail-Adresse an."),
    );

    const state = await subscribePubliclyAction(
      {},
      form({ email: "keine-adresse", source: "footer" }),
    );
    expect(state.ok).toBeUndefined();
    expect(state.error).toBe("Bitte gib eine gültige E-Mail-Adresse an.");
  });

  it("hides an internal failure behind the same success answer", async () => {
    subscribePubliclyMock.mockRejectedValue(new Error("db is down"));

    // A database hiccup must not tell a visitor anything about this address —
    // the identical-answer rule (spec §8 no. 4) outranks the error report here.
    const state = await subscribePubliclyAction(
      {},
      form({ email: "gut@example.org", source: "footer" }),
    );
    expect(state.ok).toBe(true);
  });

  it("does nothing at all while the flag is off", async () => {
    delete process.env["BDAS_FLAG_NEWSLETTER"];
    const state = await subscribePubliclyAction(
      {},
      form({ email: "x@example.org", source: "footer" }),
    );
    expect(state.ok).toBeUndefined();
    expect(subscribePubliclyMock).not.toHaveBeenCalled();
  });
});
