import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as OnboardingModule from "@bdas/onboarding";

const cookieSetMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => ({ get: () => undefined }),
  cookies: () => ({ set: (...a: unknown[]) => cookieSetMock(...a) }),
}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));
vi.mock("../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));

const registerMock = vi.fn();
const sendMock = vi.fn();
vi.mock("@bdas/auth", () => ({
  register: (...a: unknown[]) => registerMock(...a),
  buildVerifyUrl: () => "http://x/verify",
  getNotifier: () => ({ send: sendMock }),
  VERIFICATION_TTL_MS: 24 * 60 * 60 * 1000,
  COOKIE_NAME: "bdas_session",
  COOKIE_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
}));
const createProfileMock = vi.fn();
vi.mock("@bdas/members", () => ({ createProfile: (...a: unknown[]) => createProfileMock(...a) }));
const subscribeMock = vi.fn();
vi.mock("@bdas/newsletter", () => ({
  subscribeAtRegistration: (...a: unknown[]) => subscribeMock(...a),
}));

const viewerMock = vi.fn();
vi.mock("../_dashboard/session", () => ({ loadViewer: () => viewerMock() }));

const startJourneyMock = vi.fn();
const ENV = {
  groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
  bdajGroupId: null,
  netzwerkGroupId: "grp_netz",
};
vi.mock("@bdas/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof OnboardingModule>()),
  loadFlowEnv: async () => ENV,
  startJourney: (...a: unknown[]) => startJourneyMock(...a),
}));

import { createAccountAction } from "./actions";

const NAME = { firstName: "Lea", lastName: "Yıldız" };

function form(answers: unknown, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("email", "lea@example.org");
  fd.set("password", "correcthorse1");
  fd.set("consent", "true");
  fd.set("answers", typeof answers === "string" ? answers : JSON.stringify(answers));
  fd.set("from", "kampagne:sommer");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("createAccountAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    registerMock.mockReset().mockResolvedValue({ userId: "usr_1", verifyToken: "tok" });
    createProfileMock.mockReset().mockResolvedValue({});
    startJourneyMock.mockReset().mockResolvedValue({});
    sendMock.mockReset().mockResolvedValue(undefined);
    subscribeMock.mockReset().mockResolvedValue(undefined);
    viewerMock.mockReset().mockResolvedValue(null);
  });

  it("creates no second account for someone who is signed in", async () => {
    viewerMock.mockResolvedValueOnce({ id: "usr_existing" });
    const state = await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME }));
    expect(state.error).toMatch(/bereits angemeldet/);
    expect(registerMock).not.toHaveBeenCalled();
    expect(startJourneyMock).not.toHaveBeenCalled();
  });

  it("creates account, member row and journey, then reports the address", async () => {
    const answers = { typ: "unterstuetzen", name: NAME };
    const state = await createAccountAction({}, form(answers));

    expect(state).toEqual({ sentTo: "lea@example.org" });
    expect(registerMock).toHaveBeenCalledWith(
      expect.anything(),
      { email: "lea@example.org", password: "correcthorse1", consent: true },
      expect.anything(),
    );
    expect(createProfileMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      firstName: "Lea",
      lastName: "Yıldız",
    });
    expect(startJourneyMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      answers,
      entrySource: "kampagne:sommer",
      env: ENV,
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "verify", to: "lea@example.org" }),
    );
  });

  it("drops what the browser adds to the answers", async () => {
    await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME, outcome: "bdaj" }));
    expect(startJourneyMock.mock.calls[0]?.[1]).toMatchObject({
      answers: { typ: "unterstuetzen", name: NAME },
    });
    expect(startJourneyMock.mock.calls[0]?.[1].answers).not.toHaveProperty("outcome");
  });

  it("refuses unfinished answers before touching auth", async () => {
    const state = await createAccountAction({}, form({ typ: "studiere", name: NAME }));
    expect(state.error).toMatch(/Fragen/);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("refuses broken or oversized answers", async () => {
    expect((await createAccountAction({}, form("{kaputt"))).error).toMatch(/neu/);
    expect((await createAccountAction({}, form("x".repeat(20_000)))).error).toMatch(/groß/);
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("returns the field errors of register", async () => {
    const { ValidationError } = await import("@bdas/errors");
    registerMock.mockRejectedValueOnce(
      new ValidationError("Eingabe ungültig", { fields: { password: "Zu kurz." } }),
    );
    const state = await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME }));
    expect(state).toEqual({ error: "Eingabe ungültig", fields: { password: "Zu kurz." } });
  });

  it("still reports success when the journey could not be stored", async () => {
    startJourneyMock.mockRejectedValueOnce(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await createAccountAction({}, form({ typ: "unterstuetzen", name: NAME }));
    expect(state.sentTo).toBe("lea@example.org");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("subscribes to the newsletter only when ticked and the flag is on", async () => {
    process.env["BDAS_FLAG_NEWSLETTER"] = "true";
    await createAccountAction(
      {},
      form({ typ: "unterstuetzen", name: NAME }, { newsletter: "true" }),
    );
    expect(subscribeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_1",
        source: "registrierung",
        sourcePath: "/mitmachen",
      }),
    );
    delete process.env["BDAS_FLAG_NEWSLETTER"];
  });
});
