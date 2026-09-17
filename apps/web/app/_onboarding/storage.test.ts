/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { FLOW } from "@bdas/onboarding";

import { clearState, loadState, saveState, STORAGE_KEY } from "./storage";
import { INITIAL } from "./wizard-state";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("round-trips the state", () => {
    const state = { ...INITIAL, answers: { typ: "studiere" }, cursor: "name" };
    saveState(FLOW, state);
    expect(loadState(FLOW)).toEqual(state);
  });

  it("drops answers the flow does not know and unknown stages", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stage: "hack", answers: { typ: "x", weg: 1 }, cursor: 5, email: 3 }),
    );
    expect(loadState(FLOW)).toEqual(INITIAL);
  });

  it("never persists the sent screen", () => {
    saveState(FLOW, { ...INITIAL, stage: "gesendet", email: "a@b.de" });
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("survives a broken or blocked storage", () => {
    sessionStorage.setItem(STORAGE_KEY, "{kaputt");
    expect(loadState(FLOW)).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveState(FLOW, INITIAL)).not.toThrow();
    clearState();
  });
});
