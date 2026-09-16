import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as EventsModuleNs from "@bdas/events-module";
import type { CurrentMember, Grant } from "@bdas/members";

type EventsModule = typeof EventsModuleNs;

const registerGuest = vi.fn();
const registerMember = vi.fn();
const subscribePubliclyAction = vi.fn();
let currentMember: CurrentMember | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ isFlagOn: (name: string) => name === "events" }));
vi.mock("@bdas/members", () => ({
  getCurrentMember: async () => currentMember,
  isFederalBoard: (grants: ReadonlyArray<Grant>) => grants.some((g) => g.role === "federal_board"),
}));
vi.mock("@bdas/events-module", async () => {
  const actual = await vi.importActual<EventsModule>("@bdas/events-module");
  // Published events keyed by id; getEvent applies the real visibility rule.
  const events: Record<string, { visibility: string; groupId: string | null }> = {
    evt_public: { visibility: "public", groupId: null },
    evt_members: { visibility: "members_only", groupId: null },
    evt_group_a: { visibility: "group_only", groupId: "grp_a" },
    evt_group_b: { visibility: "group_only", groupId: "grp_b" },
  };
  return {
    ANON: actual.ANON,
    getEvent: async (_db: unknown, id: string, viewer: Parameters<typeof actual.canView>[0]) => {
      const e = events[id];
      if (!e) return null;
      const event = { id, status: "published", ...e } as Parameters<typeof actual.canView>[1];
      return actual.canView(viewer, event) ? event : null;
    },
    registerGuest: (...a: unknown[]) => registerGuest(...a),
    registerMember: (...a: unknown[]) => registerMember(...a),
    cancelRegistration: vi.fn(),
  };
});
vi.mock("../../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../../_newsletter/public-actions", () => ({
  subscribePubliclyAction: (...a: unknown[]) => subscribePubliclyAction(...a),
}));

import { registerAction, registerGuestAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const guest = { eventId: "evt_1", name: "Aylin Kaya", email: "aylin@example.org", consent: "on" };

function account(
  status: "pending" | "active",
  primaryGroupId: string | null,
  opts: { isBdasMember?: boolean; grants?: Grant[] } = {},
): CurrentMember {
  return {
    user: { id: "usr_1", email: "a@x.org", status: "active", roles: [], sessionId: "ses_1" },
    member: {
      id: "mem_1",
      userId: "usr_1",
      firstName: "A",
      lastName: "B",
      primaryGroupId,
      status,
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: opts.grants ?? [],
    primaryGroupKind: primaryGroupId ? "hochschulgruppe" : null,
    hasGroupScope: primaryGroupId !== null,
    isBdasMember: opts.isBdasMember ?? (status === "active" && primaryGroupId !== null),
  };
}

describe("registerAction prüft Aufnahme und Sichtbarkeit (Spec 2026-09-16 §5.4)", () => {
  beforeEach(() => {
    registerMember.mockReset().mockResolvedValue(undefined);
    currentMember = null;
  });

  it("verlangt eine Anmeldung", async () => {
    const state = await registerAction({}, form({ eventId: "evt_public" }));
    expect(state.error).toBe("Anmeldung erforderlich.");
    expect(registerMember).not.toHaveBeenCalled();
  });

  it("meldet eine noch nicht aufgenommene Person nirgends an, auch nicht öffentlich", async () => {
    currentMember = account("pending", null);
    for (const eventId of ["evt_public", "evt_members"]) {
      const state = await registerAction({}, form({ eventId }));
      expect(state.error).toBe("Das geht erst, wenn dein Konto freigegeben ist.");
    }
    expect(registerMember).not.toHaveBeenCalled();
  });

  it("weist eine fremde Gruppenveranstaltung ab, als gäbe es sie nicht", async () => {
    currentMember = account("active", "grp_a");
    const state = await registerAction({}, form({ eventId: "evt_group_b" }));
    expect(state.error).toBe("Veranstaltung nicht gefunden.");
    expect(registerMember).not.toHaveBeenCalled();
  });

  it("weist eine unbekannte Event-ID ab", async () => {
    currentMember = account("active", "grp_a");
    const state = await registerAction({}, form({ eventId: "evt_gibt_es_nicht" }));
    expect(state.error).toBe("Veranstaltung nicht gefunden.");
    expect(registerMember).not.toHaveBeenCalled();
  });

  it("meldet ein Mitglied zu eigener Gruppe und bundesweit internen Terminen an", async () => {
    currentMember = account("active", "grp_a");
    for (const eventId of ["evt_group_a", "evt_members", "evt_public"]) {
      expect(await registerAction({}, form({ eventId }))).toEqual({ ok: true });
    }
    expect(registerMember).toHaveBeenCalledTimes(3);
  });

  it("ein Förderer-Account darf zu members_only, nicht zu Gruppenterminen (Spec §4)", async () => {
    currentMember = account("active", "grp_nw", { isBdasMember: false });
    expect(await registerAction({}, form({ eventId: "evt_members" }))).toEqual({ ok: true });
    const state = await registerAction({}, form({ eventId: "evt_group_a" }));
    expect(state.error).toBe("Veranstaltung nicht gefunden.");
    expect(registerMember).toHaveBeenCalledTimes(1);
  });
});

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
