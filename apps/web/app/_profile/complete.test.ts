import { describe, expect, it, vi } from "vitest";

const getProfileMock = vi.fn();
const getMemberByUserIdMock = vi.fn();
vi.mock("@bdas/profile", () => ({ getProfile: (...a: unknown[]) => getProfileMock(...a) }));
vi.mock("@bdas/members", () => ({
  getMemberByUserId: (...a: unknown[]) => getMemberByUserIdMock(...a),
}));

import { isProfileComplete } from "./complete";

describe("isProfileComplete", () => {
  it("false when no profile row", async () => {
    getProfileMock.mockResolvedValue(null);
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(false);
  });

  it("false when completedAt is null", async () => {
    getProfileMock.mockResolvedValue({ completedAt: null });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(false);
  });

  it("false when the member has no primary group", async () => {
    getProfileMock.mockResolvedValue({ completedAt: new Date() });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: null });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(false);
  });

  it("true when completed and grouped", async () => {
    getProfileMock.mockResolvedValue({ completedAt: new Date() });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(true);
  });
});
