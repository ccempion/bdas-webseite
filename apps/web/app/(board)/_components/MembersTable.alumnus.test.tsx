/**
 * @vitest-environment happy-dom
 *
 * Die Alumnus-Markierung im Mitglieder-Detail (ADR 0043): gesetzt im Scope der
 * heutigen Gruppe, entfernt in jedem Scope, in dem sie vergeben wurde — nach
 * einem Gruppenwechsel ist das die Herkunftsgruppe. Wer darf, entscheidet
 * serverseitig requireCanGrant; eine Ablehnung muss sichtbar werden, statt dass
 * der Klick stillschweigend nichts tut.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ActionResult = { ok: boolean; error?: string };

const actions = vi.hoisted(() => ({
  grantRoleAction: vi.fn(async (..._args: unknown[]): Promise<ActionResult> => ({ ok: true })),
  revokeRoleAction: vi.fn(async (..._args: unknown[]): Promise<ActionResult> => ({ ok: true })),
}));
vi.mock("./role-actions", () => actions);
// Der Wechsel-Block des Details lädt beim Öffnen den Gruppenverlauf — für diese Datei irrelevant.
vi.mock("./MemberGroupPanel", () => ({ MemberGroupPanel: () => null }));

import { MembersTable } from "./MembersTable";

const member = {
  id: "mem_1",
  userId: "usr_1",
  firstName: "Alma",
  lastName: "Alumna",
  primaryGroupId: "grp_a",
  status: "active" as const,
  joinedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const FORBIDDEN = "Nur der Bundesvorstand oder der Lead dieser Gruppe darf diese Rolle vergeben.";

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  actions.grantRoleAction.mockClear();
  actions.revokeRoleAction.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAndOpen(alumnusScopes: Record<string, ReadonlyArray<string | null>>) {
  await act(async () => {
    root.render(
      <MembersTable
        members={[member]}
        groupNames={{ grp_a: "BDAS Aachen" }}
        alumnusScopes={alumnusScopes}
        openChanges={[]}
        revalidatePath="/gruppe/aachen/members"
        rejectionCategories={[]}
      />,
    );
  });
  await click("td", "Alma Alumna");
}

async function click(selector: string, text: string) {
  const el = [...container.querySelectorAll(selector)].find((n) =>
    n.textContent?.trim().startsWith(text),
  );
  if (!el) throw new Error(`Kein ${selector} mit Text „${text}"`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Alumnus-Markierung im Mitglieder-Detail", () => {
  it("vergibt den Grant im Scope der Gruppe des Mitglieds", async () => {
    await renderAndOpen({});
    await click("button", "Als Alumnus markieren");
    expect(actions.grantRoleAction).toHaveBeenCalledWith(
      "mem_1",
      "alumnus",
      "grp_a",
      "/gruppe/aachen/members",
    );
    expect(actions.revokeRoleAction).not.toHaveBeenCalled();
  });

  it("entzieht den Grant, wenn die Markierung bereits gesetzt ist", async () => {
    await renderAndOpen({ mem_1: ["grp_a"] });
    await click("button", "Markierung entfernen");
    expect(actions.revokeRoleAction).toHaveBeenCalledWith(
      "mem_1",
      "alumnus",
      "grp_a",
      "/gruppe/aachen/members",
    );
    expect(actions.grantRoleAction).not.toHaveBeenCalled();
  });

  it("entzieht nach einem Gruppenwechsel in jedem Herkunfts-Scope, nicht in der heutigen Gruppe", async () => {
    await renderAndOpen({ mem_1: ["grp_b", null] });
    await click("button", "Markierung entfernen");
    expect(actions.revokeRoleAction.mock.calls).toEqual([
      ["mem_1", "alumnus", "grp_b", "/gruppe/aachen/members"],
      ["mem_1", "alumnus", null, "/gruppe/aachen/members"],
    ]);
  });

  it("bricht beim ersten verweigerten Scope ab und zeigt die Ablehnung an", async () => {
    actions.revokeRoleAction.mockResolvedValueOnce({ ok: false, error: FORBIDDEN });
    await renderAndOpen({ mem_1: ["grp_b", null] });
    await click("button", "Markierung entfernen");
    expect(actions.revokeRoleAction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Nur der Bundesvorstand oder der Lead");
  });

  it("zeigt die Ablehnung des Servers beim Vergeben an", async () => {
    actions.grantRoleAction.mockResolvedValueOnce({ ok: false, error: FORBIDDEN });
    await renderAndOpen({});
    await click("button", "Als Alumnus markieren");
    expect(container.textContent).toContain("Nur der Bundesvorstand oder der Lead");
  });
});
