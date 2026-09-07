import { describe, expect, it } from "vitest";

import { FAQ_CONTEXTS, isSignedInSurface, matchContext } from "./contexts";

describe("FAQ_CONTEXTS", () => {
  it("has unique, non-empty keys and labels", () => {
    expect(FAQ_CONTEXTS.length).toBeGreaterThan(0);
    const keys = FAQ_CONTEXTS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of FAQ_CONTEXTS) {
      expect(c.key.trim()).toBe(c.key);
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.routes.length).toBeGreaterThan(0);
    }
  });
});

describe("matchContext", () => {
  // Spec §10: every registry pattern must match a route that actually exists
  // under apps/web/app. These paths are the real ones — if a route moves, this
  // test fails instead of the panel silently going quiet.
  const realRoutes: ReadonlyArray<readonly [string, string]> = [
    ["/admin/events/neu", "events.erstellen"],
    ["/admin/events/abc123/edit", "events.erstellen"],
    ["/dateien", "dateien"],
    ["/dateien/fld_123", "dateien"],
    ["/federal/files", "dateien"],
    ["/gruppe/berlin/files", "dateien"],
    ["/federal/members", "board.mitglieder"],
    ["/gruppe/berlin/members", "board.mitglieder"],
    ["/federal/groups", "board.gruppen"],
    ["/gruppe/berlin/profil", "board.gruppen"],
    ["/profil", "profil"],
    ["/account", "profil"],
  ];

  it.each(realRoutes)("maps %s to %s", (pathname, key) => {
    expect(matchContext(pathname)).toBe(key);
  });

  it("covers every registry key with at least one real route", () => {
    const covered = new Set(realRoutes.map(([, key]) => key));
    for (const c of FAQ_CONTEXTS) expect(covered.has(c.key)).toBe(true);
  });

  it("returns null for a route with no assigned context", () => {
    expect(matchContext("/faq")).toBeNull();
    expect(matchContext("/gruppen")).toBeNull();
  });
});

describe("isSignedInSurface", () => {
  it("admits the signed-in areas", () => {
    for (const p of [
      "/account",
      "/profil",
      "/dateien",
      "/faq",
      "/federal/faq",
      "/gruppe/berlin/members",
      "/admin/events",
    ]) {
      expect(isSignedInSurface(p)).toBe(true);
    }
  });

  it("keeps the public shell out", () => {
    // `/gruppen` (public group directory) must not be caught by the `/gruppe`
    // board prefix — the trailing slash in the prefix is what separates them.
    for (const p of ["/", "/gruppen", "/gruppen/berlin", "/blog", "/anmelden", "/datenschutz"]) {
      expect(isSignedInSurface(p)).toBe(false);
    }
  });
});
