import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((..._a: unknown[]) => {
  throw new Error("REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-cookie", () => ({ readSessionCookie: () => "cookie" }));

const getCurrentMemberMock = vi.fn();
vi.mock("@bdas/members", () => ({
  getCurrentMember: (...a: unknown[]) => getCurrentMemberMock(...a),
}));
const landingMock = vi.fn();
vi.mock("./landing", () => ({ resolveOnboardingLanding: (...a: unknown[]) => landingMock(...a) }));

const ENV = { groups: [], bdajGroupId: null, netzwerkGroupId: "grp_netz" };
const startJourneyMock = vi.fn();
vi.mock("@bdas/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@bdas/onboarding")>()),
  loadFlowEnv: async () => ENV,
  startJourney: (...a: unknown[]) => startJourneyMock(...a),
}));

import { resumeJourneyAction } from "./resume-action";

const me = {
  user: { id: "usr_1" },
  member: { id: "mem_1", firstName: "Lea", lastName: "Yıldız", status: "pending" },
  grants: [],
};

function form(answers: unknown): FormData {
  const fd = new FormData();
  fd.set("answers", JSON.stringify(answers));
  fd.set("from", "direkt");
  return fd;
}

describe("resumeJourneyAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_ONBOARDING"] = "true";
    getCurrentMemberMock.mockReset().mockResolvedValue(me);
    landingMock.mockReset().mockResolvedValue("/mitmachen");
    startJourneyMock.mockReset().mockResolvedValue({});
    redirectMock.mockClear();
  });

  it("starts the journey with the stored name, not the typed one", async () => {
    await expect(
      resumeJourneyAction(
        {},
        form({ typ: "unterstuetzen", name: { firstName: "Hacker", lastName: "X" } }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(startJourneyMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      answers: { typ: "unterstuetzen", name: { firstName: "Lea", lastName: "Yıldız" } },
      entrySource: "direkt",
      env: ENV,
    });
    expect(redirectMock).toHaveBeenCalledWith("/mitmachen/angaben");
  });

  it("sends people who do not need it elsewhere", async () => {
    landingMock.mockResolvedValueOnce(null);
    await expect(resumeJourneyAction({}, form({ typ: "unterstuetzen" }))).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/account");
    expect(startJourneyMock).not.toHaveBeenCalled();
  });

  it("refuses unfinished answers", async () => {
    const state = await resumeJourneyAction({}, form({ typ: "studiere" }));
    expect(state.error).toMatch(/Fragen/);
  });

  it("needs a member", async () => {
    getCurrentMemberMock.mockResolvedValueOnce({ ...me, member: null });
    expect((await resumeJourneyAction({}, form({}))).error).toMatch(/Anmeldung/);
  });
});
