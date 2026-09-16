/**
 * Keine Profil-Aktion darf ein selbst gewähltes Ziel außer einer Hochschulgruppe
 * annehmen (Spec 2026-09-16 §5.6): über netzwerk- und affiliate-Gruppen
 * entscheidet der Bundesvorstand, aus dem Profil ist das nicht vorgesehen.
 * Server-Aktionen sind öffentliche Endpunkte — das Dropdown ist keine Grenze.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentMember } from "@bdas/members";

const changePrimaryGroup = vi.fn(async () => ({ kind: "applied" }));
const createProfile = vi.fn();
const saveProfile = vi.fn(async () => ({ supersededPhotoStorageKey: null }));
let currentMember: CurrentMember | null = null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ requireFlag: () => {} }));
vi.mock("@bdas/groups", () => ({
  getGroupKind: async (_db: unknown, id: string) =>
    ({ grp_hs: "hochschulgruppe", grp_nw: "netzwerk" })[id] ?? null,
}));
vi.mock("@bdas/members", () => ({
  getCurrentMember: async () => currentMember,
  changePrimaryGroup: (...a: unknown[]) => changePrimaryGroup(...(a as [])),
  createProfile: (...a: unknown[]) => createProfile(...a),
  updateProfile: vi.fn(),
  withdrawGroupChange: vi.fn(),
}));
vi.mock("@bdas/profile", () => ({ saveProfile: (...a: unknown[]) => saveProfile(...(a as [])) }));
vi.mock("../../lib/auth-cookie", () => ({ readSessionCookie: () => undefined }));
vi.mock("../_profile/photo-url", () => ({ purgeUnreferencedPhoto: async () => {} }));
vi.mock("../_profile/submitted", () => ({ SUBMITTED_URL: "/account?submitted=1" }));

import { submitWizardAction } from "../profil/actions";
import { saveProfileAction } from "./actions";
import { saveProfileFieldsAction } from "./profile-actions";

function applicant(primaryGroupId: string | null): CurrentMember {
  return {
    user: { id: "usr_1", email: "a@x.org", status: "active", roles: [], sessionId: "s" },
    member: {
      id: "mem_1",
      userId: "usr_1",
      firstName: "A",
      lastName: "B",
      primaryGroupId,
      status: "pending",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: false,
  };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const ACTIONS = {
  "Bewerbungs-Wizard": (g: string) => submitWizardAction({}, form({ primaryGroupId: g })),
  Mitgliederformular: (g: string) =>
    saveProfileAction({}, form({ firstName: "A", lastName: "B", primaryGroupId: g })),
  Profilformular: (g: string) => saveProfileFieldsAction({}, form({ primaryGroupId: g })),
};

beforeEach(() => {
  changePrimaryGroup.mockClear();
  createProfile.mockClear();
  currentMember = applicant(null);
});

describe.each(Object.entries(ACTIONS))("%s", (_name, run) => {
  it("verweigert die Netzwerk-Gruppe als selbst gewähltes Ziel", async () => {
    const res = await run("grp_nw");
    expect(res).toMatchObject({ error: "Diese Gruppe kannst du nicht selbst wählen." });
    expect(changePrimaryGroup).not.toHaveBeenCalled();
  });

  it("lässt eine Hochschulgruppe durch", async () => {
    await run("grp_hs");
    expect(changePrimaryGroup).toHaveBeenCalledWith({}, "mem_1", "grp_hs", expect.anything());
  });
});

it("ein Account ohne Profil legt es nicht direkt in der Netzwerk-Gruppe an", async () => {
  currentMember = { ...applicant(null), member: null };
  const res = await ACTIONS.Mitgliederformular("grp_nw");
  expect(res).toMatchObject({ error: "Diese Gruppe kannst du nicht selbst wählen." });
  expect(createProfile).not.toHaveBeenCalled();
});

it("ein Förderer speichert sein Profil, ohne die Gruppe anzufassen", async () => {
  currentMember = applicant("grp_nw");
  const res = await ACTIONS.Mitgliederformular("grp_nw");
  expect(res).toEqual({ ok: true });
});
