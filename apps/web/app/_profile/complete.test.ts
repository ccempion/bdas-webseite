import { describe, expect, it, vi } from "vitest";

const getProfileMock = vi.fn();
vi.mock("@bdas/profile", () => ({ getProfile: (...a: unknown[]) => getProfileMock(...a) }));

import { isProfileComplete } from "./complete";

describe("isProfileComplete", () => {
  it("false when no profile row", async () => {
    getProfileMock.mockResolvedValue(null);
    expect(await isProfileComplete({} as never, "usr_1")).toBe(false);
  });

  it("false when completedAt is null", async () => {
    getProfileMock.mockResolvedValue({ completedAt: null });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(false);
  });

  it("true for a stamped profile without a group (ADR 0031)", async () => {
    // The applicant is groupless until a board accepts them. Demanding a group
    // here left them permanently "incomplete" and looping back into the wizard.
    getProfileMock.mockResolvedValue({ completedAt: new Date() });
    expect(await isProfileComplete({} as never, "usr_1")).toBe(true);
  });
});
