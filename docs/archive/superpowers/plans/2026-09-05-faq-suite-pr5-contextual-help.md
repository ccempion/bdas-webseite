# FAQ-Suite v2 — PR 5: Kontextuelle Hilfe („Oktopus") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FAQ answers surface where members actually need them — a floating "?" button on every signed-in surface opens a panel with the published entries assigned to the current route, plus a mini-search, a link to `/faq`, and a "Frage einreichen" that records the page it came from.

**Architecture:** The mechanism is a **code-owned context registry** (`apps/web/lib/faq/contexts.ts`, already seeded with keys and labels by PR 3) extended with route patterns. A client launcher reads `usePathname()`, resolves it to a context key through the registry, and fetches nothing until it is opened; on open it calls a route handler that resolves the session server-side and returns only entries the viewer may see. `<FaqHinweis context="…" />` is the targeted server-side variant for placing 2–3 entries directly beside a form. Visibility is never re-implemented: both paths run the published rows through the existing `assembleFaq` and flatten its output, so the panel can never show something `/faq` would hide.

**Tech Stack:** Next.js 14 App Router (route handler + Server/Client Components, `usePathname`), React 18, `@bdas/faq` (`listEntries`, `listEntriesByContext`), `@bdas/members` (`getCurrentMember`), `@bdas/design-system` (`Dialog`, `Input`), Tailwind via design-system tokens, vitest (node), Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md`](../specs/2026-09-04-faq-suite-v2-design.md) — §3 (`faq_entry_contexts`, the registry is code), §5 (accordion idiom), §7 (the whole feature), §9 (PR 5 scope), §10 (registry unit tests, help-panel e2e).

**Predecessors:** PR 1–3 merged to `main`; **PR 4 must merge first** — this PR mounts PR 4's `SubmitQuestionDialog` and depends on its `context` prop.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Feature flag:** everything is behind `faq_suite`. Nothing may render on the `StaticFaq` fallback path.
- **Signed-in surfaces only** (Spec §7): "nur eingeloggte Flächen — das FAQ ist login-pflichtig, öffentliche Seiten bleiben außen vor." Two independent gates must both pass — a session exists (checked server-side) **and** the pathname is a signed-in surface (checked client-side, since a Server Component cannot read the pathname).
- **Lazy** (Spec §7): "kein Payload auf jeder Seite." The launcher must not fetch entries on mount, only on first open. Do not pass entry data through the layout.
- **The registry stays code** (Spec §3): the module stores context strings; which keys are valid and which routes they map to is `apps/web/lib/faq/contexts.ts`. Do not add a table.
- **Visibility is not re-implemented.** Route handler and `<FaqHinweis>` both filter by running rows through `assembleFaq` from `apps/web/lib/faq/assemble.ts` and flattening. A second visibility code path is a review rejection.
- **No cross-module deep imports**; `@bdas/faq` only (CLAUDE.md §4).
- **Design tokens only** — no inline hex, radius, shadow, duration (CLAUDE.md §7). Reuse the `bdas-accordion` idiom for the panel's disclosures (Spec §5, CLAUDE.md §7: "Treat it as the canonical disclosure pattern").
- **The floating button sits at `z-40`.** `CookieNotice` is `fixed inset-x-0 bottom-0 z-50` (`apps/web/components/CookieNotice.tsx:70`) and must keep winning; the launcher must never cover the cookie bar.
- **UI copy is German.**
- **Tests ship in this PR.** vitest runs in the `node` environment with no DOM testing library — put logic in pure modules and test those; browser behaviour goes to `e2e/faq.e2e.ts`.
- **`/review` and `/security-review` are required on this PR** (Spec §9). The route handler is a new authenticated read surface — it is the security-relevant part.
- **Strengthen the tests below on sight.** Every task in PRs 1–3 found plan-supplied tests that would have passed against a wrong implementation. The snippets here are a floor, not a ceiling: the spec is the authority. If a test would still pass with the behaviour it is meant to pin removed, fix the test before writing the implementation.

---

## File Structure

**Created**

| File                                    | Responsibility                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/faq/help.ts`              | Pure. Flattens `assembleFaq` sections, partitions by context key, picks the popular fallback, filters by a mini-search query. |
| `apps/web/lib/faq/help.test.ts`         | Unit tests for the above.                                                                                                     |
| `apps/web/app/api/faq/help/route.ts`    | Authenticated GET returning the visible entries for a context, lazily.                                                        |
| `apps/web/app/_faq/FaqHelpMount.tsx`    | Server. Flag + session gate; renders the launcher.                                                                            |
| `apps/web/app/_faq/FaqHelpLauncher.tsx` | Client. Route gate via `usePathname`, floating "?" button, lazy fetch, owns panel state.                                      |
| `apps/web/app/_faq/FaqHelpPanel.tsx`    | Client. Panel body: context entries, mini-search, "Alle FAQ ansehen", "Frage einreichen".                                     |
| `apps/web/app/_faq/FaqHinweis.tsx`      | Server. Targeted inline embed for one context (max 3 entries).                                                                |

**Modified**

| File                                | Change                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/lib/faq/contexts.ts`      | Each entry gains `routes: readonly RegExp[]`; add `matchContext` and `isSignedInSurface`. |
| `apps/web/lib/faq/contexts.test.ts` | Extend for the new matchers.                                                              |
| `apps/web/lib/faq/assemble.ts`      | `FaqEntryView` gains `contexts: readonly string[]`.                                       |
| `apps/web/app/layout.tsx`           | Mount `<FaqHelpMount />`.                                                                 |
| `apps/web/app/dateien/page.tsx`     | One real `<FaqHinweis context="dateien" />` placement.                                    |
| `e2e/faq.e2e.ts`                    | Help-panel coverage on a context route.                                                   |

**Untouched on purpose:** `modules/faq/**` — `listEntries` and `listEntriesByContext` are already exported and integration-tested by PR 1.

---

### Task 1: Route patterns in the context registry

**Files:**

- Modify: `apps/web/lib/faq/contexts.ts`
- Test: `apps/web/lib/faq/contexts.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `type FaqContext = { readonly key: string; readonly label: string; readonly routes: readonly RegExp[] }`
  - `matchContext(pathname: string): string | null` — the key of the first registry entry whose patterns match, else `null`.
  - `isSignedInSurface(pathname: string): boolean` — whether the help launcher may appear at all.

Spec §10 asks for "Unit-Tests, dass jedes Register-Muster auf reale Routen matcht" — the test below pins every key to a path that exists in `apps/web/app/`.

- [ ] **Step 1: Write the failing test**

Replace `apps/web/lib/faq/contexts.test.ts` with:

```ts
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
    ["/dateien", "dateien"],
    ["/dateien/fld_123", "dateien"],
    ["/federal/files", "dateien"],
    ["/gruppe/berlin/files", "dateien"],
    ["/federal/members", "board.mitglieder"],
    ["/gruppe/berlin/members", "board.mitglieder"],
    ["/federal/groups", "board.gruppen"],
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/lib/faq/contexts.test.ts`
Expected: FAIL — `matchContext` and `isSignedInSurface` are not exported.

- [ ] **Step 3: Extend the registry**

Replace `apps/web/lib/faq/contexts.ts` with:

```ts
/**
 * Stabile Schlüssel für „wo taucht dieser Eintrag als Kontext-Hilfe auf".
 * Das Modul speichert nur die Strings; welche gültig sind und welcher Route
 * sie entsprechen, bleibt Code (Spec §3). Ab PR 5 trägt jeder Eintrag die
 * Routen-Muster, über die das Hilfe-Panel den aktuellen Pfad auflöst.
 */
export type FaqContext = {
  readonly key: string;
  readonly label: string;
  readonly routes: readonly RegExp[];
};

export const FAQ_CONTEXTS: readonly FaqContext[] = [
  {
    key: "events.erstellen",
    label: "Event erstellen",
    routes: [/^\/admin\/events\/neu$/, /^\/admin\/events\/[^/]+\/edit$/],
  },
  {
    key: "dateien",
    label: "Dateien",
    routes: [/^\/dateien(\/|$)/, /^\/federal\/files(\/|$)/, /^\/gruppe\/[^/]+\/files(\/|$)/],
  },
  {
    key: "board.mitglieder",
    label: "Mitgliederverwaltung",
    routes: [/^\/federal\/members(\/|$)/, /^\/gruppe\/[^/]+\/members(\/|$)/],
  },
  {
    key: "board.gruppen",
    label: "Gruppenverwaltung",
    routes: [/^\/federal\/groups(\/|$)/, /^\/gruppe\/[^/]+\/profil(\/|$)/],
  },
  { key: "profil", label: "Profil", routes: [/^\/profil(\/|$)/, /^\/account(\/|$)/] },
];

/** The key whose patterns match this path, or null. First match wins. */
export function matchContext(pathname: string): string | null {
  return FAQ_CONTEXTS.find((c) => c.routes.some((re) => re.test(pathname)))?.key ?? null;
}

/**
 * Where the help launcher may appear at all. Spec §7 confines contextual help
 * to signed-in surfaces, and a Server Component cannot read the pathname — so
 * the route half of that gate lives here and runs on the client.
 *
 * `/gruppe/` keeps its trailing slash on purpose: `/gruppen` is the public
 * group directory and must not be caught by the board prefix.
 */
const SIGNED_IN_PREFIXES: readonly string[] = [
  "/account",
  "/admin",
  "/dashboard",
  "/dateien",
  "/faq",
  "/federal",
  "/gruppe/",
  "/profil",
];

export function isSignedInSurface(pathname: string): boolean {
  return SIGNED_IN_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/web/lib/faq/contexts.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the board form still compiles**

`FaqEntryDialog.tsx` maps `FAQ_CONTEXTS` to `FilterChip`s using only `.key` and `.label`, so the added field is backwards-compatible.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/faq/contexts.ts apps/web/lib/faq/contexts.test.ts
git commit -m "feat(faq): route patterns and matchers in the context registry"
```

---

### Task 2: Pure helpers for the help payload

**Files:**

- Modify: `apps/web/lib/faq/assemble.ts` (`FaqEntryView`, `toEntryView`)
- Create: `apps/web/lib/faq/help.ts`
- Test: `apps/web/lib/faq/help.test.ts`

**Interfaces:**

- Consumes: `FaqEntryView`, `FaqSectionView` from `./assemble`.
- Produces:
  - `FaqEntryView` gains `contexts: readonly string[]`.
  - `flattenSections(sections: readonly FaqSectionView[]): FaqEntryView[]` — every visible entry, sections in order, top-level entries before subgroup entries.
  - `partitionByContext(entries: readonly FaqEntryView[], contextKey: string | null): { inContext: FaqEntryView[]; rest: FaqEntryView[] }`
  - `popularFrom(sections: readonly FaqSectionView[], limit: number): FaqEntryView[]` — the viewer's primary section first (`assembleFaq` already orders it there), capped.
  - `searchEntries<T extends { searchText: string }>(entries: readonly T[], query: string): T[]` — matches `searchText`, empty query returns the input unchanged. **Generic on purpose:** the panel (Task 4) calls it with `FaqHelpEntry`, not `FaqEntryView`; a signature pinned to `FaqEntryView` would not typecheck there.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/faq/help.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { FaqEntryView, FaqSectionView } from "./assemble";
import { flattenSections, partitionByContext, popularFrom, searchEntries } from "./help";

function entry(id: string, over: Partial<FaqEntryView> = {}): FaqEntryView {
  return {
    id,
    question: `Frage ${id}`,
    body: { type: "doc", content: [] },
    searchText: `frage ${id}`,
    topic: null,
    youtubeId: null,
    updatedAtIso: "2026-09-01T00:00:00.000Z",
    relatedIds: [],
    contexts: [],
    ...over,
  };
}

function section(
  key: FaqSectionView["key"],
  entries: FaqEntryView[],
  subEntries: FaqEntryView[] = [],
): FaqSectionView {
  return {
    key,
    title: key,
    intro: null,
    defaultOpen: false,
    entries,
    subgroups:
      subEntries.length > 0
        ? [{ id: "local_board", title: "Vorstand", highlighted: false, entries: subEntries }]
        : [],
  };
}

describe("flattenSections", () => {
  it("keeps section order and puts top-level entries before subgroup entries", () => {
    const flat = flattenSections([
      section("mitglieder", [entry("a")], [entry("b")]),
      section("allgemein", [entry("c")]),
    ]);
    expect(flat.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty list for no sections", () => {
    expect(flattenSections([])).toEqual([]);
  });
});

describe("partitionByContext", () => {
  it("splits on the context key", () => {
    const entries = [
      entry("a", { contexts: ["dateien"] }),
      entry("b"),
      entry("c", { contexts: ["profil", "dateien"] }),
    ];
    const { inContext, rest } = partitionByContext(entries, "dateien");
    expect(inContext.map((e) => e.id)).toEqual(["a", "c"]);
    expect(rest.map((e) => e.id)).toEqual(["b"]);
  });

  it("puts everything in `rest` when there is no context", () => {
    const entries = [entry("a", { contexts: ["dateien"] })];
    const { inContext, rest } = partitionByContext(entries, null);
    expect(inContext).toEqual([]);
    expect(rest.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("popularFrom", () => {
  it("takes from the viewer's primary section first and caps at the limit", () => {
    // assembleFaq already hoists the primary section to index 0 (order.ts).
    const sections = [
      section("bundesvorstand", [entry("a"), entry("b"), entry("c")]),
      section("allgemein", [entry("d")]),
    ];
    expect(popularFrom(sections, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("falls through to later sections when the first is short", () => {
    const sections = [section("bundesvorstand", [entry("a")]), section("allgemein", [entry("d")])];
    expect(popularFrom(sections, 3).map((e) => e.id)).toEqual(["a", "d"]);
  });
});

describe("searchEntries", () => {
  it("matches searchText case-insensitively", () => {
    const entries = [
      entry("a", { searchText: "wie lege ich ein event an" }),
      entry("b", { searchText: "dateien hochladen" }),
    ];
    expect(searchEntries(entries, "EVENT").map((e) => e.id)).toEqual(["a"]);
  });

  it("returns everything for an empty or whitespace query", () => {
    const entries = [entry("a"), entry("b")];
    expect(searchEntries(entries, "   ")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/lib/faq/help.test.ts`
Expected: FAIL — cannot resolve `./help`, and `contexts` is not a property of `FaqEntryView`.

- [ ] **Step 3: Add `contexts` to the entry view**

In `apps/web/lib/faq/assemble.ts`, add the field to the `FaqEntryView` type, after `relatedIds`:

```ts
  relatedIds: readonly string[];
  // Registry keys this entry is pinned to (Spec §3). Carried on the view so
  // the help panel can partition a single fetched payload without a second
  // query; a handful of short strings per entry.
  contexts: readonly string[];
```

…and populate it in `toEntryView`, after `relatedIds: row.relatedIds,`:

```ts
    contexts: row.contexts,
```

- [ ] **Step 4: Write the helpers**

Create `apps/web/lib/faq/help.ts`:

```ts
import type { FaqEntryView, FaqSectionView } from "./assemble";

/**
 * Every entry a viewer may see, flat. The input is always the output of
 * `assembleFaq`, so visibility has already been applied — this file must
 * never re-decide who sees what (Spec §7: the panel is "gefiltert durch
 * dieselbe Sichtbarkeitslogik wie /faq").
 */
export function flattenSections(sections: readonly FaqSectionView[]): FaqEntryView[] {
  const out: FaqEntryView[] = [];
  for (const section of sections) {
    out.push(...section.entries);
    for (const sub of section.subgroups) out.push(...sub.entries);
  }
  return out;
}

export function partitionByContext(
  entries: readonly FaqEntryView[],
  contextKey: string | null,
): { inContext: FaqEntryView[]; rest: FaqEntryView[] } {
  if (contextKey === null) return { inContext: [], rest: [...entries] };
  const inContext: FaqEntryView[] = [];
  const rest: FaqEntryView[] = [];
  for (const e of entries) (e.contexts.includes(contextKey) ? inContext : rest).push(e);
  return { inContext, rest };
}

/**
 * The "Beliebte Fragen" fallback (Spec §7) when no entry is pinned to the
 * current route. `assembleFaq` already hoists the viewer's own section to the
 * front (order.ts), so taking from the top is what "Bereich des Viewers" means.
 */
export function popularFrom(sections: readonly FaqSectionView[], limit: number): FaqEntryView[] {
  return flattenSections(sections).slice(0, limit);
}

/**
 * The panel's mini-search, over the already-visible entries only. Generic over
 * anything carrying `searchText` — the help panel searches `FaqHelpEntry`, the
 * trimmed wire shape, not the full `FaqEntryView`.
 */
export function searchEntries<T extends { searchText: string }>(
  entries: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...entries];
  return entries.filter((e) => e.searchText.includes(q));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run apps/web/lib/faq/help.test.ts apps/web/lib/faq/assemble.test.ts`
Expected: PASS. If `assemble.test.ts` builds `FaqEntryView` literals, add `contexts: []` to them.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add apps/web/lib/faq/help.ts apps/web/lib/faq/help.test.ts apps/web/lib/faq/assemble.ts apps/web/lib/faq/assemble.test.ts
git commit -m "feat(faq): pure helpers for the contextual help payload"
```

---

### Task 3: The lazy route handler

**Files:**

- Create: `apps/web/app/api/faq/help/route.ts`
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `listEntries(db, { status: "published" })`, `listTopics(db)` from `@bdas/faq`; `getCurrentMember` from `@bdas/members`; `readSessionCookie()` from `apps/web/lib/auth-cookie`; `assembleFaq` from `apps/web/lib/faq/assemble`; `flattenSections`, `partitionByContext`, `popularFrom` from `apps/web/lib/faq/help`.
- Produces: `GET /api/faq/help?context=<key|omitted>` returning
  `{ contextEntries: FaqHelpEntry[]; allEntries: FaqHelpEntry[]; popular: FaqHelpEntry[] }`
  where `FaqHelpEntry = { id: string; question: string; body: unknown; searchText: string; youtubeId: string | null }`.
  Status codes: `404` when the flag is off, `401` when not signed in, `200` otherwise.

The handler is the security-relevant surface of this PR: it must resolve the viewer from the session cookie and never accept a caller-supplied identity.

- [ ] **Step 1: Write the route handler**

Create `apps/web/app/api/faq/help/route.ts`:

```ts
import { getDb } from "@bdas/db";
import { listEntries, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { assembleFaq, type FaqEntryView } from "../../../../lib/faq/assemble";
import { flattenSections, partitionByContext, popularFrom } from "../../../../lib/faq/help";

export const dynamic = "force-dynamic";

/** How many entries the "Beliebte Fragen" fallback offers (Spec §7). */
const POPULAR_LIMIT = 5;

export type FaqHelpEntry = {
  id: string;
  question: string;
  body: unknown;
  searchText: string;
  youtubeId: string | null;
};

/** Only what the panel renders — topic chips, related links and timestamps
 *  belong to /faq, not to a help sheet. */
function toHelpEntry(e: FaqEntryView): FaqHelpEntry {
  return {
    id: e.id,
    question: e.question,
    body: e.body,
    searchText: e.searchText,
    youtubeId: e.youtubeId,
  };
}

export async function GET(req: Request) {
  if (!isFlagOn("faq_suite")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  // The viewer comes from the session cookie only. The `context` query param
  // selects which entries are highlighted; it never widens what is returned.
  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(getDb(), session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const context = new URL(req.url).searchParams.get("context");

  const db = getDb();
  const [entries, topics] = await Promise.all([
    listEntries(db, { status: "published" }),
    listTopics(db),
  ]);
  // Same assembly as /faq — one visibility implementation, so the panel can
  // never surface an entry the FAQ page would hide (Spec §7).
  const { sections } = assembleFaq({ entries, topics, grants: me.grants });
  const visible = flattenSections(sections);
  const { inContext } = partitionByContext(visible, context);

  return Response.json({
    contextEntries: inContext.map(toHelpEntry),
    allEntries: visible.map(toHelpEntry),
    popular: popularFrom(sections, POPULAR_LIMIT).map(toHelpEntry),
  });
}
```

- [ ] **Step 2: Write the failing e2e test**

Append to `e2e/faq.e2e.ts`:

```ts
test.describe("Kontextuelle Hilfe", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("the help route rejects a signed-out request", async ({ page }) => {
    const res = await page.request.get("/api/faq/help?context=dateien");
    expect(res.status()).toBe(401);
  });

  test("the help route returns only entries the viewer may see", async ({ page }) => {
    const email = "faq-hilfe-api@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Hilfe" });

    const res = await page.request.get("/api/faq/help?context=dateien");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { allEntries: Array<{ question: string }> };
    // A plain member never sees the Bundesvorstand section (visibility.ts).
    const questions = body.allEntries.map((e) => e.question).join(" ");
    expect(questions).not.toContain("Bundesvorstand");
    expect(body.allEntries.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "help route"`
Expected: PASS.

- [ ] **Step 4: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add apps/web/app/api/faq/help/route.ts e2e/faq.e2e.ts
git commit -m "feat(faq): lazy, session-filtered help route handler"
```

---

### Task 4: The floating launcher and panel

**Files:**

- Create: `apps/web/app/_faq/FaqHelpMount.tsx`
- Create: `apps/web/app/_faq/FaqHelpLauncher.tsx`
- Create: `apps/web/app/_faq/FaqHelpPanel.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `matchContext`, `isSignedInSurface` from `apps/web/lib/faq/contexts`; `searchEntries` from `apps/web/lib/faq/help`; `FaqHelpEntry` from `apps/web/app/api/faq/help/route`; `FaqRichText` from `apps/web/app/faq/FaqRichText`; `SubmitQuestionDialog` from `apps/web/app/faq/SubmitQuestionDialog` (**PR 4**); `Dialog`, `Input` from `@bdas/design-system`; `loadCurrentMember` from `apps/web/app/_dashboard/session`.
- Produces: `<FaqHelpMount />` — a Server Component taking no props, mounted once in the root layout.

Both gates: `FaqHelpMount` checks flag + session (server), `FaqHelpLauncher` checks the pathname (client). Neither alone is sufficient.

- [ ] **Step 1: Write the panel**

Create `apps/web/app/_faq/FaqHelpPanel.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Dialog, Input } from "@bdas/design-system";

import type { FaqHelpEntry } from "../api/faq/help/route";
import { FaqRichText } from "../faq/FaqRichText";
import { searchEntries } from "../../lib/faq/help";

/**
 * Panel body. `contextEntries` are the entries pinned to this route; when
 * there are none the panel shows `popular` instead (Spec §7). The mini-search
 * always runs over `allEntries` — everything the viewer may see.
 */
export function FaqHelpPanel({
  open,
  onClose,
  loading,
  contextEntries,
  popular,
  allEntries,
  onSubmitQuestion,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  contextEntries: readonly FaqHelpEntry[];
  popular: readonly FaqHelpEntry[];
  allEntries: readonly FaqHelpEntry[];
  onSubmitQuestion: () => void;
}) {
  const [query, setQuery] = useState("");

  const searching = query.trim() !== "";
  const shown = useMemo(() => {
    if (searching) return searchEntries(allEntries, query);
    return contextEntries.length > 0 ? contextEntries : popular;
  }, [searching, query, allEntries, contextEntries, popular]);

  const heading = searching
    ? "Suchergebnisse"
    : contextEntries.length > 0
      ? "Passend zu dieser Seite"
      : "Beliebte Fragen";

  return (
    <Dialog open={open} onClose={onClose} title="Hilfe">
      <div className="flex flex-col gap-4">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Im FAQ suchen"
          aria-label="Im FAQ suchen"
        />
        <h3 className="text-sm font-bold text-bdas-ink">{heading}</h3>

        {loading ? (
          <p className="text-sm text-bdas-ink-muted">Wird geladen …</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-bdas-ink-muted">
            Dazu gibt es noch keine Antwort — reich die Frage gern ein.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((e) => (
              <details key={e.id} className="bdas-accordion">
                <summary>{e.question}</summary>
                <div>
                  <FaqRichText doc={e.body} />
                </div>
              </details>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t border-bdas-soft pt-3">
          <Link
            href="/faq"
            className="text-sm font-semibold text-bdas-red transition-colors duration-bdas-quick ease-bdas hover:underline"
          >
            Alle FAQ ansehen
          </Link>
          <button
            type="button"
            onClick={onSubmitQuestion}
            className="text-sm font-semibold text-bdas-ink-body transition-colors duration-bdas-quick ease-bdas hover:text-bdas-ink"
          >
            Frage einreichen
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write the launcher**

Create `apps/web/app/_faq/FaqHelpLauncher.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import type { FaqHelpEntry } from "../api/faq/help/route";
import { SubmitQuestionDialog } from "../faq/SubmitQuestionDialog";
import { isSignedInSurface, matchContext } from "../../lib/faq/contexts";
import { FaqHelpPanel } from "./FaqHelpPanel";

type Payload = {
  contextEntries: FaqHelpEntry[];
  allEntries: FaqHelpEntry[];
  popular: FaqHelpEntry[];
};

const EMPTY: Payload = { contextEntries: [], allEntries: [], popular: [] };

/**
 * The route half of Spec §7's gate — a Server Component cannot read the
 * pathname, so the public/signed-in split happens here. Nothing is fetched
 * until the panel is opened ("kein Payload auf jeder Seite").
 */
export function FaqHelpLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [empty, setEmpty] = useState(false);

  const context = matchContext(pathname);

  // "Der Button erscheint nie vor leerem Panel" (Spec §7): the FAQ ships
  // seeded content, so the only way to an empty panel is a viewer with no
  // visible entries at all. That is discovered on the first open, and the
  // launcher then retires itself for the rest of this page session rather
  // than paying a probe request on every page.
  if (!isSignedInSurface(pathname) || empty) return null;

  async function openPanel() {
    setOpen(true);
    if (payload) return;
    setLoading(true);
    try {
      const url = context
        ? `/api/faq/help?context=${encodeURIComponent(context)}`
        : "/api/faq/help";
      const res = await fetch(url);
      const next: Payload = res.ok ? ((await res.json()) as Payload) : EMPTY;
      setPayload(next);
      if (next.allEntries.length === 0) {
        setOpen(false);
        setEmpty(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-label="Hilfe öffnen"
        // z-40: the cookie notice is z-50 and must keep winning.
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-bdas-pill bg-bdas-red text-lg font-bold text-bdas-surface shadow-bdas-card transition-colors duration-bdas-quick ease-bdas"
      >
        ?
      </button>
      {open && (
        <FaqHelpPanel
          open
          onClose={() => setOpen(false)}
          loading={loading}
          contextEntries={payload?.contextEntries ?? []}
          popular={payload?.popular ?? []}
          allEntries={payload?.allEntries ?? []}
          onSubmitQuestion={() => {
            setOpen(false);
            setSubmitOpen(true);
          }}
        />
      )}
      {submitOpen && (
        <SubmitQuestionDialog
          open
          onClose={() => setSubmitOpen(false)}
          initialQuestion=""
          // Records the page the question came from (Spec §3).
          context={context}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Write the server mount**

Create `apps/web/app/_faq/FaqHelpMount.tsx`:

```tsx
import { isFlagOn } from "@bdas/feature-flags";

import { loadCurrentMember } from "../_dashboard/session";
import { FaqHelpLauncher } from "./FaqHelpLauncher";

/**
 * The session half of Spec §7's gate. `loadCurrentMember` is `cache()`d per
 * request and the root layout already resolves the session for the header, so
 * this adds no extra database read.
 */
export async function FaqHelpMount() {
  if (!isFlagOn("faq_suite")) return null;
  const me = await loadCurrentMember();
  if (!me) return null;
  return <FaqHelpLauncher />;
}
```

- [ ] **Step 4: Mount it in the root layout**

In `apps/web/app/layout.tsx`, add the import:

```tsx
import { FaqHelpMount } from "./_faq/FaqHelpMount";
```

…and render it just before `<CookieNotice … />`:

```tsx
<FaqHelpMount />
```

- [ ] **Step 5: Write the failing e2e test**

Append inside `test.describe("Kontextuelle Hilfe", …)` in `e2e/faq.e2e.ts`:

```ts
test("the help panel shows the entries assigned to the route", async ({ page }) => {
  // Nothing in the seed is pinned to a context (migrations/0002_seed.sql
  // writes no faq_entry_contexts rows), so the board creates one first.
  const question = `E2E-Kontexthilfe ${uniqueSlug("k")}?`;

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });

  await page.goto("/federal/faq");
  await page.getByRole("button", { name: "+ Eintrag" }).click();
  const entryDialog = page.getByRole("dialog");
  await entryDialog.getByPlaceholder("Frage").fill(question);
  // "Anzeigen bei: Dateien" — the FilterChip for the `dateien` registry key.
  await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
  await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();

  // /dateien maps to the `dateien` context (contexts.ts).
  await page.goto("/dateien");
  await page.getByRole("button", { name: "Hilfe öffnen" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Passend zu dieser Seite")).toBeVisible();
  await expect(panel.getByText(question, { exact: true })).toBeVisible();
});

test("the launcher stays off public pages", async ({ page }) => {
  const email = "faq-hilfe-public@e2e.bdas.test";
  await deleteUserByEmail(email);
  await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Public" });

  await page.goto("/gruppen");
  await expect(page.getByRole("button", { name: "Hilfe öffnen" })).toHaveCount(0);
});
```

- [ ] **Step 6: Run the e2e tests**

Run: `pnpm e2e e2e/faq.e2e.ts -g "Kontextuelle Hilfe"`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `pnpm typecheck && pnpm lint`

```bash
git add apps/web/app/_faq apps/web/app/layout.tsx e2e/faq.e2e.ts
git commit -m "feat(faq): global contextual help panel"
```

---

### Task 5: `<FaqHinweis>` for targeted embedding

**Files:**

- Create: `apps/web/app/_faq/FaqHinweis.tsx`
- Modify: `apps/web/app/dateien/page.tsx`
- Test: `e2e/faq.e2e.ts`

**Interfaces:**

- Consumes: `listEntriesByContext(db, context)`, `listTopics(db)` from `@bdas/faq`; `loadCurrentMember` from `apps/web/app/_dashboard/session`; `assembleFaq` from `apps/web/lib/faq/assemble`; `flattenSections` from `apps/web/lib/faq/help`; `FaqRichText` from `apps/web/app/faq/FaqRichText`.
- Produces: `<FaqHinweis context={string} />` — a Server Component rendering at most 3 entries, or nothing.

This is the one place `listEntriesByContext` is the right service: it needs a single context's entries, not the whole corpus. Spec §7 says to use it sparingly — the panel is the default way, so add exactly one placement here.

- [ ] **Step 1: Write the component**

Create `apps/web/app/_faq/FaqHinweis.tsx`:

```tsx
import Link from "next/link";

import { getDb } from "@bdas/db";
import { listEntriesByContext, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";

import { loadCurrentMember } from "../_dashboard/session";
import { assembleFaq } from "../../lib/faq/assemble";
import { flattenSections } from "../../lib/faq/help";
import { FaqRichText } from "../faq/FaqRichText";

/** Spec §7: "kompaktes Accordion, max. 2–3 Einträge". */
const MAX_ENTRIES = 3;

/**
 * Targeted inline help beside a specific form. Use sparingly — the floating
 * panel is the standard way in (Spec §7). Renders nothing when the flag is
 * off, the viewer is signed out, or no visible entry is pinned to `context`.
 */
export async function FaqHinweis({ context }: { context: string }) {
  if (!isFlagOn("faq_suite")) return null;
  const me = await loadCurrentMember();
  if (!me) return null;

  const db = getDb();
  const [entries, topics] = await Promise.all([listEntriesByContext(db, context), listTopics(db)]);
  if (entries.length === 0) return null;

  // Same assembly as /faq and the help route — visibility is decided in one
  // place only (Spec §7).
  const { sections } = assembleFaq({ entries, topics, grants: me.grants });
  const visible = flattenSections(sections).slice(0, MAX_ENTRIES);
  if (visible.length === 0) return null;

  return (
    <aside className="rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <h2 className="mb-2 text-sm font-bold text-bdas-ink">Hilfe zu dieser Seite</h2>
      <div className="flex flex-col gap-2">
        {visible.map((e) => (
          <details key={e.id} className="bdas-accordion">
            <summary>{e.question}</summary>
            <div>
              <FaqRichText doc={e.body} />
            </div>
          </details>
        ))}
      </div>
      <Link
        href="/faq"
        className="mt-3 inline-block text-sm font-semibold text-bdas-red transition-colors duration-bdas-quick ease-bdas hover:underline"
      >
        Mehr im FAQ
      </Link>
    </aside>
  );
}
```

- [ ] **Step 2: Place it once**

In `apps/web/app/dateien/page.tsx`, add the import:

```tsx
import { FaqHinweis } from "../_faq/FaqHinweis";
```

The page builds a `body` variable across three branches (signed out / no profile / folder index) and renders it inside one `<main>`. Add the embed after `{body}`, as the last child of that `<main>`:

```tsx
      {body}
      <FaqHinweis context="dateien" />
    </main>
```

The three branches stay untouched: `FaqHinweis` resolves the session itself and returns `null` for a signed-out viewer, so it cannot leak help into the "melde dich an" state.

- [ ] **Step 3: Write the failing e2e test**

Append inside `test.describe("Kontextuelle Hilfe", …)` in `e2e/faq.e2e.ts`:

```ts
test("FaqHinweis renders the pinned entry inline on /dateien", async ({ page }) => {
  const question = `E2E-Hinweis ${uniqueSlug("h")}?`;

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });

  await page.goto("/federal/faq");
  await page.getByRole("button", { name: "+ Eintrag" }).click();
  const entryDialog = page.getByRole("dialog");
  await entryDialog.getByPlaceholder("Frage").fill(question);
  await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
  await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();

  await page.goto("/dateien");
  const hinweis = page.getByRole("complementary").filter({ hasText: "Hilfe zu dieser Seite" });
  await expect(hinweis).toBeVisible();
  await expect(hinweis.getByText(question, { exact: true })).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e test**

Run: `pnpm e2e e2e/faq.e2e.ts -g "FaqHinweis"`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm e2e e2e/faq.e2e.ts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_faq/FaqHinweis.tsx apps/web/app/dateien/page.tsx e2e/faq.e2e.ts
git commit -m "feat(faq): FaqHinweis inline context help"
```

---

### Task 6: Module README and the privacy note

**Files:**

- Modify: `modules/faq/README.md`
- Test: none (documentation)

CLAUDE.md §3 requires each module's README to describe its public surface; PR 5 is the first consumer of `listEntriesByContext`, and the README should say where the context keys come from. PR 2 already added the YouTube facade entry under `docs/datenschutz/`; the help panel adds no third-party request, so no new privacy entry is needed — but the README should state that explicitly so a later reader does not re-litigate it.

- [ ] **Step 1: Update the README**

Read `modules/faq/README.md`, then add a short section:

```markdown
## Kontext-Schlüssel

`faq_entry_contexts` speichert freie Strings. Das gültige Register — Schlüssel,
Label und Routen-Muster — lebt im Code unter `apps/web/lib/faq/contexts.ts`
(Spec §3). Das Modul validiert die Schlüssel bewusst nicht: ein Schlüssel, der
aus dem Register verschwindet, bleibt auf seinen Einträgen stehen und wird von
der App als Rohwert angezeigt, statt still zu verschwinden.

Konsument:innen: `listEntriesByContext` für die gezielte Einbettung
(`<FaqHinweis>`), `listEntries` für das globale Hilfe-Panel, das ohnehin den
ganzen sichtbaren Bestand für seine Mini-Suche braucht.

Datenschutz: Das Hilfe-Panel lädt ausschließlich von der eigenen Origin
(`/api/faq/help`); nur das YouTube-Facade der Leseseite spricht Dritte an, und
das ist in `docs/datenschutz/` dokumentiert.
```

- [ ] **Step 2: Check formatting and commit**

Run: `pnpm format:check`
Expected: clean (run `pnpm format` if not).

```bash
git add modules/faq/README.md
git commit -m "docs(faq): document the context registry and its consumers"
```

---

## Definition of done

- [ ] Every registry key carries route patterns, and a unit test pins each to a path that exists under `apps/web/app`.
- [ ] `GET /api/faq/help` returns 404 with the flag off, 401 signed out, and otherwise only entries the session's viewer may see.
- [ ] A floating "?" button appears on signed-in surfaces and never on public ones (`/gruppen` in particular).
- [ ] Opening it fetches once; the panel shows route-matched entries, or "Beliebte Fragen" when none match.
- [ ] The mini-search filters across all visible entries; "Alle FAQ ansehen" links to `/faq`; "Frage einreichen" opens PR 4's dialog with the route's context key.
- [ ] `<FaqHinweis context="dateien" />` renders at most 3 pinned entries on `/dateien` and nothing when there are none.
- [ ] The launcher never covers the cookie notice.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm e2e e2e/faq.e2e.ts` all pass.
- [ ] `/review` and `/security-review` run on the PR (Spec §9).
