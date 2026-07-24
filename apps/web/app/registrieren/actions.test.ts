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
    redirectMock.mockClear();
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_AUTH"];
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
});
