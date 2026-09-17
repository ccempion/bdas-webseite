/**
 * The grant actions (ADR 0047) pass the session member to the files service,
 * which alone decides who may grant — and turn its refusal into a message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@bdas/errors";
import type { CurrentMember } from "@bdas/members";

const grantFolderAccess = vi.fn();
const revokeFolderAccess = vi.fn();
let flagOn = true;
const SESSION = { user: { id: "usr_board" } } as unknown as CurrentMember;
let currentMember: CurrentMember | null = SESSION;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: () => flagOn }));
vi.mock("@bdas/files", () => ({
  grantFolderAccess: (...a: unknown[]) => grantFolderAccess(...a),
  revokeFolderAccess: (...a: unknown[]) => revokeFolderAccess(...a),
}));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("../../../../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));

import { grantFolderAccessAction, revokeFolderAccessAction } from "./actions";

beforeEach(() => {
  grantFolderAccess.mockReset();
  revokeFolderAccess.mockReset();
  flagOn = true;
  currentMember = SESSION;
});

describe("grantFolderAccessAction", () => {
  it("gibt mit dem Sitzungskonto frei", async () => {
    await expect(grantFolderAccessAction("fld_1", "mem_1", true)).resolves.toEqual({ ok: true });
    expect(grantFolderAccess).toHaveBeenCalledWith(
      {},
      "fld_1",
      "mem_1",
      { canWrite: true },
      SESSION,
    );
  });

  it("meldet die Ablehnung des Dienstes", async () => {
    grantFolderAccess.mockRejectedValue(new ForbiddenError("Nur der Bundesvorstand."));
    await expect(grantFolderAccessAction("fld_1", "mem_1", false)).resolves.toEqual({
      ok: false,
      error: "Nur der Bundesvorstand.",
    });
  });

  it("tut ohne Anmeldung oder mit abgeschaltetem Modul nichts", async () => {
    currentMember = null;
    expect((await grantFolderAccessAction("fld_1", "mem_1", false)).ok).toBe(false);
    currentMember = SESSION;
    flagOn = false;
    expect((await grantFolderAccessAction("fld_1", "mem_1", false)).ok).toBe(false);
    expect(grantFolderAccess).not.toHaveBeenCalled();
  });
});

describe("revokeFolderAccessAction", () => {
  it("entzieht mit dem Sitzungskonto", async () => {
    await expect(revokeFolderAccessAction("fld_1", "mem_1")).resolves.toEqual({ ok: true });
    expect(revokeFolderAccess).toHaveBeenCalledWith({}, "fld_1", "mem_1", SESSION);
  });

  it("meldet die Ablehnung des Dienstes", async () => {
    revokeFolderAccess.mockRejectedValue(new ForbiddenError("Nur der Bundesvorstand."));
    await expect(revokeFolderAccessAction("fld_1", "mem_1")).resolves.toEqual({
      ok: false,
      error: "Nur der Bundesvorstand.",
    });
  });
});
