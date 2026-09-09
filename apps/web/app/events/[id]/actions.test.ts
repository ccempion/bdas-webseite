import { beforeEach, describe, expect, it, vi } from "vitest";

const registerGuest = vi.fn();
const subscribePubliclyAction = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: (name: string) => name === "events" }));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => null }));
vi.mock("@bdas/events-module", () => ({
  registerGuest: (...a: unknown[]) => registerGuest(...a),
  registerMember: vi.fn(),
  cancelRegistration: vi.fn(),
}));
vi.mock("../../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../_newsletter/public-actions", () => ({
  subscribePubliclyAction: (...a: unknown[]) => subscribePubliclyAction(...a),
}));

import { registerGuestAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const guest = { eventId: "evt_1", name: "Aylin Kaya", email: "aylin@example.org", consent: "on" };

describe("registerGuestAction and the newsletter tick", () => {
  beforeEach(() => {
    registerGuest.mockReset().mockResolvedValue({ status: "registered" });
    subscribePubliclyAction.mockReset().mockResolvedValue({ ok: true });
  });

  it("signs nobody up without the tick", async () => {
    const state = await registerGuestAction({}, form(guest));

    expect(state.ok).toBe(true);
    expect(subscribePubliclyAction).not.toHaveBeenCalled();
  });

  it("signs the guest up when the tick is set, naming the event as the source", async () => {
    const state = await registerGuestAction({}, form({ ...guest, newsletter: "on" }));

    expect(state.ok).toBe(true);
    expect(subscribePubliclyAction).toHaveBeenCalledTimes(1);
    const passed = subscribePubliclyAction.mock.calls[0]?.[1] as FormData;
    expect(passed.get("email")).toBe("aylin@example.org");
    expect(passed.get("source")).toBe("event_gast");
    expect(passed.get("sourcePath")).toBe("/events/evt_1");
  });

  it("does not sign anyone up when the registration itself failed", async () => {
    const { ValidationError } = await import("@bdas/errors");
    registerGuest.mockRejectedValue(new ValidationError("Die Veranstaltung ist abgesagt."));

    const state = await registerGuestAction({}, form({ ...guest, newsletter: "on" }));

    expect(state.error).toBe("Die Veranstaltung ist abgesagt.");
    // A failed registration must leave no newsletter row behind.
    expect(subscribePubliclyAction).not.toHaveBeenCalled();
  });

  it("keeps the registration when the newsletter signup throws", async () => {
    subscribePubliclyAction.mockRejectedValue(new Error("newsletter down"));

    const state = await registerGuestAction({}, form({ ...guest, newsletter: "on" }));

    // The consent is optional and independent: it may never take the
    // registration down with it.
    expect(state.ok).toBe(true);
  });

  it("still refuses a registration without the data-processing consent", async () => {
    const { consent: _consent, ...withoutConsent } = guest;
    const state = await registerGuestAction({}, form({ ...withoutConsent, newsletter: "on" }));

    expect(state.error).toBeDefined();
    expect(registerGuest).not.toHaveBeenCalled();
    expect(subscribePubliclyAction).not.toHaveBeenCalled();
  });
});
