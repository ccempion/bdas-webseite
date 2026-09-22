/**
 * Mocked unit test for the Server Action's own logic (flag checks, display
 * name construction, error surfacing, session-clearing, non-fatal email
 * send) — same style as self-service-group.actions.test.ts. The underlying
 * service calls (requestAccountDeletion, sendTransactional) already have
 * their own real-Postgres integration tests in PR1/PR2; this test verifies
 * the wiring between them, not their internals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@bdas/errors";
import type { CurrentMember } from "@bdas/members";

const requestAccountDeletion = vi.fn();
const buildReactivationUrl = vi.fn(
  (base: string, token: string) => `${base}/konto-reaktivieren/${token}`,
);
const sendTransactional = vi.fn();
const clearSessionCookie = vi.fn();
let currentMember: CurrentMember | null = null;

vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ requireFlag: () => {} }));
vi.mock("@bdas/auth", () => ({
  requestAccountDeletion: (...a: unknown[]) => requestAccountDeletion(...a),
  buildReactivationUrl: (...a: [string, string]) => buildReactivationUrl(...a),
}));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("@bdas/notifications", () => ({
  sendTransactional: (...a: unknown[]) => sendTransactional(...a),
}));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));
vi.mock("../../lib/notifications-bootstrap", () => ({ bootNotifications: () => {} }));
vi.mock("../../lib/auth-cookie", () => ({
  readSessionCookie: () => undefined,
  clearSessionCookie: () => clearSessionCookie(),
}));

import { requestAccountDeletionAction } from "./delete-account-actions";

function member(overrides: Partial<CurrentMember> = {}): CurrentMember {
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

describe("requestAccountDeletionAction", () => {
  beforeEach(() => {
    requestAccountDeletion.mockReset();
    sendTransactional.mockReset().mockResolvedValue({ status: "sent", logId: "ntfy_1" });
    clearSessionCookie.mockReset();
    currentMember = member();
  });

  it("requires an authenticated session", async () => {
    currentMember = null;

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ error: "Anmeldung erforderlich." });
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("requires a member profile", async () => {
    currentMember = member({ member: null });

    const res = await requestAccountDeletionAction();

    expect(res.error).toMatch(/Profildaten/);
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("requests deletion with the member's display name, sends the confirmation email, and clears the session", async () => {
    requestAccountDeletion.mockResolvedValue({
      requestId: "adr_1",
      scheduledPurgeAt: new Date("2026-10-22T00:00:00Z"),
      reactivationToken: "tok_abc",
    });

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ ok: true });
    expect(requestAccountDeletion).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      displayName: "Mara Beispiel",
    });
    expect(sendTransactional).toHaveBeenCalledWith(
      expect.anything(),
      "account_deletion_requested",
      "mbr_1",
      expect.objectContaining({ reactivationUrl: expect.stringContaining("tok_abc") }),
    );
    expect(clearSessionCookie).toHaveBeenCalledTimes(1);
  });

  it("surfaces an AppError message without clearing the session", async () => {
    requestAccountDeletion.mockRejectedValue(
      new ConflictError("Für dieses Konto ist bereits eine Löschung angefragt."),
    );

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ error: "Für dieses Konto ist bereits eine Löschung angefragt." });
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("rethrows a non-AppError", async () => {
    requestAccountDeletion.mockRejectedValue(new Error("db exploded"));

    await expect(requestAccountDeletionAction()).rejects.toThrow("db exploded");
  });

  it("still clears the session and reports success when the confirmation email fails to send", async () => {
    requestAccountDeletion.mockResolvedValue({
      requestId: "adr_1",
      scheduledPurgeAt: new Date("2026-10-22T00:00:00Z"),
      reactivationToken: "tok_abc",
    });
    sendTransactional.mockRejectedValue(new Error("resend down"));

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ ok: true });
    expect(clearSessionCookie).toHaveBeenCalledTimes(1);
  });
});
