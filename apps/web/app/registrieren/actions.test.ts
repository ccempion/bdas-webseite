import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: () => ({ get: () => undefined }) }));
const redirectMock = vi.fn((..._args: unknown[]) => {
  throw new Error("REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }));

const registerMock = vi.fn();
const createProfileMock = vi.fn();
vi.mock("@bdas/auth", () => ({
  register: (...a: unknown[]) => registerMock(...a),
  buildVerifyUrl: () => "http://x/verify",
  getNotifier: () => ({ send: vi.fn() }),
}));
vi.mock("@bdas/members", () => ({
  createProfile: (...a: unknown[]) => createProfileMock(...a),
}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));

const subscribeAtRegistrationMock = vi.fn();
const setSignupCookieMock = vi.fn();
vi.mock("@bdas/newsletter", () => ({
  subscribeAtRegistration: (...a: unknown[]) => subscribeAtRegistrationMock(...a),
}));
vi.mock("../../lib/newsletter-bootstrap", () => ({ bootNewsletter: () => {} }));
vi.mock("../_newsletter/signup-cookie", () => ({
  setSignupCookie: (...a: unknown[]) => setSignupCookieMock(...a),
}));

import { registerAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("registerAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    registerMock.mockReset().mockResolvedValue({ userId: "usr_1", verifyToken: "tok" });
    createProfileMock.mockReset().mockResolvedValue({});
    subscribeAtRegistrationMock.mockReset().mockResolvedValue(undefined);
    setSignupCookieMock.mockReset();
    redirectMock.mockClear();
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_AUTH"];
    delete process.env["BDAS_FLAG_NEWSLETTER"];
  });

  it("persists first/last name via createProfile after register", async () => {
    await expect(
      registerAction(
        {},
        form({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@x.de",
          password: "correcthorse1",
          consent: "true",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(createProfileMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("rejects an empty first name before touching auth", async () => {
    const state = await registerAction(
      {},
      form({ firstName: " ", lastName: "L", email: "a@x.de", password: "pw", consent: "true" }),
    );
    expect(state.fields?.["firstName"]).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });

  describe("with the newsletter flag on", () => {
    const base = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "Ada@X.de",
      password: "correcthorse1",
      consent: "true",
    };

    beforeEach(() => {
      process.env["BDAS_FLAG_NEWSLETTER"] = "true";
    });

    it("writes a pending row from the ticked checkbox and sets no cookie", async () => {
      await expect(registerAction({}, form({ ...base, newsletter: "true" }))).rejects.toThrow(
        "REDIRECT",
      );

      expect(subscribeAtRegistrationMock).toHaveBeenCalledWith(expect.anything(), {
        userId: "usr_1",
        email: "Ada@X.de",
        source: "registrierung",
        sourcePath: "/registrieren",
        context: { ip: "0.0.0.0" },
      });
      // Ticked means done — nobody gets asked a second time (spec §6).
      expect(setSignupCookieMock).not.toHaveBeenCalled();
    });

    it("subscribes nobody when the box is left unticked, but remembers the address", async () => {
      await expect(registerAction({}, form(base))).rejects.toThrow("REDIRECT");

      expect(subscribeAtRegistrationMock).not.toHaveBeenCalled();
      expect(setSignupCookieMock).toHaveBeenCalledWith({
        userId: "usr_1",
        email: "ada@x.de",
      });
    });

    it("still creates the account and redirects when the newsletter write throws", async () => {
      subscribeAtRegistrationMock.mockRejectedValue(new Error("db is down"));

      await expect(registerAction({}, form({ ...base, newsletter: "true" }))).rejects.toThrow(
        "REDIRECT",
      );

      expect(createProfileMock).toHaveBeenCalled();
      expect(redirectMock).toHaveBeenCalledWith("/registrieren/erfolg");
    });
  });

  it("leaves the newsletter alone entirely while the flag is off", async () => {
    await expect(
      registerAction(
        {},
        form({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@x.de",
          password: "correcthorse1",
          consent: "true",
          newsletter: "true",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(subscribeAtRegistrationMock).not.toHaveBeenCalled();
    expect(setSignupCookieMock).not.toHaveBeenCalled();
  });
});
