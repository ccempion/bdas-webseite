import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Assemble from "../../lib/data-export/assemble";
import type { CurrentMember } from "@bdas/members";

const sendTransactional = vi.fn();
const sendTransactionalToGuest = vi.fn();
const buildDataExport = vi.fn();
let currentMember: CurrentMember | null = null;

vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
const requireFlag = vi.fn();
vi.mock("@bdas/feature-flags", () => ({ requireFlag: (...a: unknown[]) => requireFlag(...a) }));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("@bdas/notifications", () => ({
  sendTransactional: (...a: unknown[]) => sendTransactional(...a),
  sendTransactionalToGuest: (...a: unknown[]) => sendTransactionalToGuest(...a),
}));
vi.mock("../../lib/notifications-bootstrap", () => ({ bootNotifications: () => {} }));
vi.mock("../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../lib/data-export/readers", () => ({ realReaders: () => ({}) }));
vi.mock("../../lib/data-export/assemble", async (importOriginal) => ({
  ...(await importOriginal<typeof Assemble>()),
  buildDataExport: (...a: unknown[]) => buildDataExport(...a),
  toZip: () => new Uint8Array([80, 75, 3, 4]),
}));

import { sendDataExportAction } from "./data-export-actions";

function me(overrides: Partial<CurrentMember> = {}): CurrentMember {
  return {
    user: {
      id: "usr_1",
      email: "mara@example.org",
      status: "active",
      roles: [],
      sessionId: "ses_1",
    },
    member: {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "Mara",
      lastName: "Beispiel",
      primaryGroupId: null,
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: true,
    ...overrides,
  };
}

describe("sendDataExportAction", () => {
  beforeEach(() => {
    requireFlag.mockReset();
    sendTransactional.mockReset().mockResolvedValue({ status: "sent", logId: "n1" });
    sendTransactionalToGuest.mockReset().mockResolvedValue({ status: "sent", logId: "n2" });
    buildDataExport.mockReset().mockResolvedValue({ exportedAt: "x", categories: [], skipped: [] });
    currentMember = me();
  });

  it("requires an authenticated session and sends nothing without one", async () => {
    currentMember = null;

    expect(await sendDataExportAction()).toEqual({ error: "Anmeldung erforderlich." });
    expect(sendTransactional).not.toHaveBeenCalled();
    expect(sendTransactionalToGuest).not.toHaveBeenCalled();
    expect(buildDataExport).not.toHaveBeenCalled();
  });

  it("builds the export for the session principal only and mails it as an attachment to the member", async () => {
    const res = await sendDataExportAction();

    expect(res).toEqual({ ok: true });
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: "mbr_1",
    });
    expect(sendTransactional).toHaveBeenCalledWith(
      expect.anything(),
      "data_export_ready",
      "mbr_1",
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "bdas-datenexport.zip" })],
      }),
    );
  });

  it("falls back to the account address when there is no member row", async () => {
    currentMember = me({ member: null });

    const res = await sendDataExportAction();

    expect(res).toEqual({ ok: true });
    expect(buildDataExport).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      memberId: null,
    });
    expect(sendTransactional).not.toHaveBeenCalled();
    expect(sendTransactionalToGuest).toHaveBeenCalledWith(
      expect.anything(),
      "data_export_ready",
      { email: "mara@example.org", name: null },
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: "bdas-datenexport.zip" })],
      }),
    );
  });

  it("reports a failed send instead of claiming success", async () => {
    sendTransactional.mockResolvedValue({ status: "failed", logId: "n3" });

    expect(await sendDataExportAction()).toEqual({
      error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.",
    });
  });

  it.each(["notifications", "account_deletion"])(
    "throws and builds/sends nothing when the %s flag is off",
    async (off) => {
      requireFlag.mockImplementation((f: string) => {
        if (f === off) throw new Error(`flag ${f} off`);
      });

      await expect(sendDataExportAction()).rejects.toThrow(`flag ${off} off`);
      expect(buildDataExport).not.toHaveBeenCalled();
      expect(sendTransactional).not.toHaveBeenCalled();
      expect(sendTransactionalToGuest).not.toHaveBeenCalled();
    },
  );

  it("gates on auth, account_deletion and notifications", async () => {
    await sendDataExportAction();

    expect(requireFlag).toHaveBeenCalledWith("auth");
    expect(requireFlag).toHaveBeenCalledWith("account_deletion");
    expect(requireFlag).toHaveBeenCalledWith("notifications");
  });

  it("reports an unresolvable member recipient as a failed send", async () => {
    sendTransactional.mockResolvedValue(null);

    expect(await sendDataExportAction()).toEqual({
      error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.",
    });
  });

  it("reports a failed guest-path send as an error", async () => {
    currentMember = me({ member: null });
    sendTransactionalToGuest.mockResolvedValue({ status: "failed", logId: "n4" });

    expect(await sendDataExportAction()).toEqual({
      error: "Die E-Mail konnte nicht verschickt werden. Bitte versuche es später erneut.",
    });
  });

  it("takes no argument: nothing but the session can choose whose data is exported or mailed", () => {
    expect(sendDataExportAction).toHaveLength(0);
  });
});
