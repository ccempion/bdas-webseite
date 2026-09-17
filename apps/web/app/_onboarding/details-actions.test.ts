import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((..._a: unknown[]) => {
  throw new Error("REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-cookie", () => ({ readSessionCookie: () => "cookie" }));
const purgeMock = vi.fn();
vi.mock("../_profile/photo-url", () => ({
  purgeUnreferencedPhoto: (...a: unknown[]) => purgeMock(...a),
}));

const me = {
  user: { id: "usr_1" },
  member: { id: "mem_1", userId: "usr_1", status: "pending", firstName: "Lea", lastName: "Y" },
  grants: [],
};
const getCurrentMemberMock = vi.fn();
vi.mock("@bdas/members", () => ({
  getCurrentMember: (...a: unknown[]) => getCurrentMemberMock(...a),
}));
const saveProfileMock = vi.fn();
vi.mock("@bdas/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bdas/profile")>()),
  saveProfile: (...a: unknown[]) => saveProfileMock(...a),
}));

const ENV = { groups: [], bdajGroupId: null, netzwerkGroupId: "grp_netz" };
const getJourneyMock = vi.fn();
const saveDetailsMock = vi.fn();
const completeMock = vi.fn();
vi.mock("@bdas/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bdas/onboarding")>()),
  loadFlowEnv: async () => ENV,
  getJourneyForUser: (...a: unknown[]) => getJourneyMock(...a),
  saveDetails: (...a: unknown[]) => saveDetailsMock(...a),
  completeJourney: (...a: unknown[]) => completeMock(...a),
}));

import { saveDetailsAction, submitApplicationAction } from "./details-actions";

const FOERDERER = {
  id: "onb_1",
  userId: "usr_1",
  answers: { typ: "unterstuetzen", name: { firstName: "Lea", lastName: "Y" } },
  outcome: "foerderer",
  status: "details_offen",
};

function form(values: unknown, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("values", JSON.stringify(values));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("submitApplicationAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_PROFILE"] = "true";
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    getCurrentMemberMock.mockReset().mockResolvedValue(me);
    getJourneyMock.mockReset().mockResolvedValue(FOERDERER);
    saveProfileMock.mockReset().mockResolvedValue({ supersededPhotoStorageKey: null });
    completeMock.mockReset().mockResolvedValue({ kind: "submitted", journey: FOERDERER });
    redirectMock.mockClear();
  });

  it("saves the profile of the recomputed type, then completes the journey", async () => {
    await expect(
      submitApplicationAction(
        {},
        form({ interesse: "Kultur", gefundenDurch: "webseite", bdajFunktion: "mitglied" }),
      ),
    ).rejects.toThrow("REDIRECT");

    expect(saveProfileMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      fields: {
        nutzertyp: "foerderer",
        interesse: "Kultur",
        gefundenDurch: "webseite",
        empfehlerName: null,
        vorstellung: null,
        photoStorageKey: null,
      },
      actor: { userId: "usr_1", grants: [] },
      groupId: null,
    });
    expect(completeMock).toHaveBeenCalledWith(expect.anything(), {
      memberId: "mem_1",
      actor: { userId: "usr_1", grants: [] },
      env: ENV,
    });
    expect(saveProfileMock.mock.invocationCallOrder[0]).toBeLessThan(
      completeMock.mock.invocationCallOrder[0]!,
    );
    expect(redirectMock).toHaveBeenCalledWith("/mitmachen/fertig");
  });

  it("ignores a group id or outcome in the form", async () => {
    await expect(
      submitApplicationAction(
        {},
        form({ interesse: "Kultur", gefundenDurch: "webseite" }, { groupId: "grp_x", outcome: "bdaj" }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(completeMock.mock.calls[0]?.[1]).not.toHaveProperty("groupId");
    expect(saveProfileMock.mock.calls[0]?.[1].fields.nutzertyp).toBe("foerderer");
  });

  it("returns field errors from the profile and does not apply", async () => {
    const { ValidationError } = await import("@bdas/errors");
    saveProfileMock.mockRejectedValueOnce(
      new ValidationError("Profil-Eingabe ungültig", { fields: { interesse: "Pflicht." } }),
    );
    const state = await submitApplicationAction({}, form({ gefundenDurch: "webseite" }));
    expect(state).toEqual({ error: "Profil-Eingabe ungültig", fields: { interesse: "Pflicht." } });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("surfaces a conflicting open application", async () => {
    const { ConflictError } = await import("@bdas/errors");
    completeMock.mockRejectedValueOnce(new ConflictError("Du hast bereits eine offene Bewerbung."));
    const state = await submitApplicationAction({}, form({ interesse: "K", gefundenDurch: "webseite" }));
    expect(state.error).toMatch(/offene Bewerbung/);
  });

  it("needs a signed-in member and a journey", async () => {
    getCurrentMemberMock.mockResolvedValueOnce(null);
    expect((await submitApplicationAction({}, form({}))).error).toMatch(/Anmeldung/);
    getJourneyMock.mockResolvedValueOnce(null);
    await expect(submitApplicationAction({}, form({}))).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenLastCalledWith("/mitmachen");
  });

  it("does not resubmit a submitted journey", async () => {
    getJourneyMock.mockResolvedValueOnce({ ...FOERDERER, status: "abgeschickt" });
    await expect(submitApplicationAction({}, form({}))).rejects.toThrow("REDIRECT");
    expect(saveProfileMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenLastCalledWith("/mitmachen/fertig");
  });
});

describe("saveDetailsAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    getCurrentMemberMock.mockReset().mockResolvedValue(me);
    saveDetailsMock.mockReset().mockResolvedValue({});
  });

  it("stores only known fields for the signed-in account", async () => {
    await saveDetailsAction({ interesse: "Kultur", evil: "x" });
    expect(saveDetailsMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      details: expect.objectContaining({ interesse: "Kultur" }),
    });
    expect(saveDetailsMock.mock.calls[0]?.[1].details).not.toHaveProperty("evil");
  });

  it("never throws", async () => {
    saveDetailsMock.mockRejectedValueOnce(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveDetailsAction({})).resolves.toBeUndefined();
    log.mockRestore();
  });
});
