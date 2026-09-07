# FAQ-Suite v2 — PR 5: Kontextuelle Hilfe ("Oktopus") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein schwebender „?"-Button auf jeder eingeloggten Seite öffnet ein Hilfe-Panel mit den FAQ-Einträgen, die zur aktuellen Route passen (Routen-Matching über das in PR 3 vorgezogene Kontext-Register), Mini-Suche über alle sichtbaren Einträge und Zugang zum Einreichen-Dialog; zusätzlich eine gezielte `<FaqHinweis context="…" />`-Einbettung für ausgewählte Formulare.

**Architecture:** Das Panel lädt seinen Inhalt **erst beim Öffnen** über einen neuen Route-Handler (`GET /api/faq/help?path=…`), der Session und Kontext serverseitig filtert — kein FAQ-Payload auf jeder Seite. `apps/web/lib/faq/contexts.ts` (PR 3) bekommt ein `pattern`-Feld pro Kontext (additiv — bestehende `{key,label}`-Konsumenten aus PR 3 sind unverändert typkompatibel) plus eine reine `matchContextsForPath`-Funktion. Eine neue reine Funktion `buildHelpPanel` (in `apps/web/lib/faq/panel.ts`) kombiniert Routen-Match, Sichtbarkeit (`isEntryVisible`, neu aus `assemble.ts` exportiert) und den „Beliebte Fragen"-Fallback über die viewer-eigene Primärsektion (`primarySection` aus PR 2s `order.ts`) — der Route-Handler ist nur noch dünne I/O-Schicht darüber, die eigentliche Logik ist unit-testbar ohne Netzwerk/DB. Der Button wird einmalig über eine Server-Gate-Komponente im Root-Layout montiert, die nur bei angemeldetem Viewer + aktivem Flag überhaupt etwas rendert.

**Tech Stack:** Next.js 14 App Router Route Handlers, React Client Components, Tailwind + Design-Tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md` (§3 Kontext-Register, §7 „Oktopus", §9)

## Global Constraints

- Voraussetzung: **PR 1–4 sind gemerged** — `apps/web/lib/faq/{contexts,assemble,order,plain-text}.ts`, `@bdas/faq`s `listEntries`/`listEntriesByContext`, PR 4s `FaqSubmissionDialog`/`submission-actions.ts` existieren.
- Route-Handler-Konvention: plain `Request`/`Response.json(...)` (kein `NextRequest`/`NextResponse`), `getCurrentMember(getDb(), readSessionCookie())` — exakt wie `apps/web/app/api/content/upload-url/route.ts`, nicht `_dashboard/session.ts`s `loadCurrentMember` (das ist React-`cache()`-only für Server Components).
- Nur eingeloggte Flächen (Spec §7 „Abgrenzung") — sowohl der Button (Gate prüft `loadViewer()`) als auch der Route-Handler (401 ohne Session) müssen das unabhängig voneinander durchsetzen; der Client verlässt sich nie allein auf das Verstecken des Buttons.
- „Der Button erscheint nie vor leerem Panel" (Spec §7) ist eine **Konsequenz** des garantierten Fallbacks (`buildHelpPanel` liefert `highlighted` nie leer, solange der Viewer irgendeinen sichtbaren veröffentlichten Eintrag hat) — keine zusätzliche Vorab-Prüfung nötig oder gewollt (das würde die Lazy-Load-Anforderung brechen).
- CLAUDE.md §7: keine Inline-Hex/Radius/Schatten/Dauer — nur Token-Klassen.
- Alle UI-Texte deutsch. Vor jedem Commit Prettier auf die geänderten Dateien.
- `/security-review` ist für diesen PR Pflicht (Spec §9) — der neue Route-Handler ist der einzige Ort, an dem Sichtbarkeitsfilterung außerhalb von `/faq` selbst re-implementiert wird; das ist der Prüfpunkt.

## File Structure

```
apps/web/lib/faq/
  contexts.ts             + pattern-Feld je Kontext, matchContextsForPath()
  contexts.test.ts          + neue Fälle
  assemble.ts              + Export isEntryVisible(entry, grants)
  assemble.test.ts           + neue Fälle
  panel.ts                 buildHelpPanel() — reine Panel-Logik
  panel.test.ts
apps/web/app/api/faq/help/
  route.ts                 GET — Session + Kontext-Filterung, dünner Wrapper um buildHelpPanel
apps/web/app/_faq/
  HelpPanelGate.tsx         Server-Gate: nur bei Login + Flag
  HelpPanelButton.tsx       Client: schwebender Button, Dialog-Panel, Mini-Suche
  FaqHinweis.tsx            Server Component: gezielte Einbettung
apps/web/app/layout.tsx    + <HelpPanelGate />
apps/web/app/admin/events/neu/page.tsx   + <FaqHinweis context="events.erstellen" />
e2e/faq.e2e.ts             erweitert: Hilfe-Panel auf Kontext-Route, Fallback, FaqHinweis
```

---

### Task 1: Kontext-Register um Routen-Muster erweitern (TDD)

**Files:**

- Modify: `apps/web/lib/faq/contexts.ts`, `apps/web/lib/faq/contexts.test.ts`

**Interfaces:**

- Produces (erweitert, additiv — `key`/`label` unverändert, PR 3s Verwendung in `FaqEntryDialog.tsx` liest weiterhin nur diese beiden Felder):

```ts
export type FaqContext = { readonly key: string; readonly label: string; readonly pattern: RegExp };
export const FAQ_CONTEXTS: readonly FaqContext[];
export function matchContextsForPath(pathname: string): readonly string[];
```

- Reale Routen für die fünf bestehenden Schlüssel: `events.erstellen` → `/admin/events/neu`, `dateien` → `/dateien` (und Unterpfade), `board.mitglieder` → `/federal/members`, `board.gruppen` → `/federal/groups`, `profil` → `/profil`.

- [ ] **Step 1: Failing Tests** (an `contexts.test.ts` anhängen):

```ts
import { matchContextsForPath } from "./contexts";
// ...

describe("matchContextsForPath", () => {
  it("matches the events-erstellen route", () => {
    expect(matchContextsForPath("/admin/events/neu")).toEqual(["events.erstellen"]);
  });
  it("matches /dateien and its subpaths", () => {
    expect(matchContextsForPath("/dateien")).toEqual(["dateien"]);
    expect(matchContextsForPath("/dateien/ordner-1")).toEqual(["dateien"]);
  });
  it("matches nothing on an unrelated route", () => {
    expect(matchContextsForPath("/events")).toEqual([]);
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run lib/faq/contexts.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `FaqContext` um `pattern` erweitern und für jeden bestehenden Eintrag setzen, dann die Matching-Funktion ergänzen:

```ts
export type FaqContext = { readonly key: string; readonly label: string; readonly pattern: RegExp };

export const FAQ_CONTEXTS: readonly FaqContext[] = [
  { key: "events.erstellen", label: "Event erstellen", pattern: /^\/admin\/events\/neu\/?$/ },
  { key: "dateien", label: "Dateien", pattern: /^\/dateien(\/|$)/ },
  { key: "board.mitglieder", label: "Mitgliederverwaltung", pattern: /^\/federal\/members\/?$/ },
  { key: "board.gruppen", label: "Gruppenverwaltung", pattern: /^\/federal\/groups\/?$/ },
  { key: "profil", label: "Profil", pattern: /^\/profil\/?$/ },
];

/** Alle Kontext-Schlüssel, deren Routen-Muster auf `pathname` passen — meist
 *  eine, kann theoretisch mehrere sein, wenn sich zwei Muster überlappen. */
export function matchContextsForPath(pathname: string): readonly string[] {
  return FAQ_CONTEXTS.filter((c) => c.pattern.test(pathname)).map((c) => c.key);
}
```

- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run lib/faq/contexts.test.ts && pnpm --filter web typecheck` → grün. (`pnpm --filter web typecheck` prüft auch, dass PR 3s `FaqEntryDialog.tsx` mit dem erweiterten `FaqContext`-Typ weiterhin kompiliert — es destrukturiert nur `key`/`label`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/contexts.ts apps/web/lib/faq/contexts.test.ts
git commit -m "feat(faq): Routen-Matching für das Kontext-Register"
```

---

### Task 2: `isEntryVisible` aus `assemble.ts` exportieren (TDD)

**Files:**

- Modify: `apps/web/lib/faq/assemble.ts`, `apps/web/lib/faq/assemble.test.ts`

**Interfaces:**

- Produces: `export function isEntryVisible(entry: FaqEntryRow, grants: readonly FaqGrant[]): boolean` (`FaqEntryRow` ist der bestehende lokale Alias für `FaqEntry` aus `@bdas/faq`, siehe `assemble.ts` Zeile 2) — dieselbe Sichtbarkeitsregel wie in `assembleFaq`s Schleife (Bereich über `SECTION_META[...].visibleTo`, Untergruppe zusätzlich über `subgroups[...].visibleTo`), aber für einen einzelnen, bereits geladenen Eintrag statt für eine ganze Liste — gebraucht vom Hilfe-Panel (Task 3) und von `<FaqHinweis>` (Task 6), die beide über `listEntriesByContext` bzw. eine flache Liste kommen, nicht über `assembleFaq`s Gruppierung.

- [ ] **Step 1: Failing Tests** (an `assemble.test.ts` anhängen):

```ts
import { isEntryVisible } from "./assemble";
// ... (die `entry`-Fixture-Funktion aus den bestehenden Tests wiederverwenden)

describe("isEntryVisible", () => {
  it("hides a bundesvorstand entry from a plain member", () => {
    const e = entry({ section: "bundesvorstand" });
    expect(isEntryVisible(e, [{ role: "member", groupId: null }])).toBe(false);
  });
  it("shows a top-level vorstand entry (no subgroup) to any vorstand role", () => {
    const e = entry({ section: "vorstand", subgroup: null });
    expect(isEntryVisible(e, [{ role: "page_editor", groupId: "g1" }])).toBe(true);
  });
  it("hides a subgroup entry from a different subgroup's holder", () => {
    const e = entry({ section: "vorstand", subgroup: "event_organizer" });
    expect(isEntryVisible(e, [{ role: "page_editor", groupId: "g1" }])).toBe(false);
  });
  it("allgemein and mitglieder are visible to everyone", () => {
    expect(isEntryVisible(entry({ section: "allgemein" }), [])).toBe(true);
    expect(isEntryVisible(entry({ section: "mitglieder" }), [])).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run lib/faq/assemble.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** (an `assemble.ts` anhängen, nach `SECTION_META`):

```ts
export function isEntryVisible(entry: FaqEntryRow, grants: readonly FaqGrant[]): boolean {
  const meta = SECTION_META[entry.section];
  if (meta.visibleTo !== "all" && !hasAny(grants, meta.visibleTo)) return false;
  if (entry.subgroup !== null) {
    const subMeta = meta.subgroups?.find((s) => s.key === entry.subgroup);
    if (!subMeta || !hasAny(grants, subMeta.visibleTo)) return false;
  }
  return true;
}
```

- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run lib/faq/assemble.test.ts && pnpm --filter web typecheck` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/assemble.ts apps/web/lib/faq/assemble.test.ts
git commit -m "feat(faq): isEntryVisible für Einzeleinträge außerhalb von assembleFaq"
```

---

### Task 3: `buildHelpPanel` — reine Panel-Logik (TDD)

**Files:**

- Create: `apps/web/lib/faq/panel.ts`, Test: `apps/web/lib/faq/panel.test.ts`

**Interfaces:**

- Consumes: `FaqEntry` aus `@bdas/faq`; `isEntryVisible` aus `./assemble`; `matchContextsForPath` aus `./contexts`; `primarySection, type FaqGrant` aus `./order`; `plainText` aus `./plain-text`.
- Produces:

```ts
export type FaqPanelEntry = {
  id: string;
  question: string;
  body: unknown;
  searchText: string;
  youtubeId: string | null;
};
export type FaqHelpPanel = {
  contextLabel: string | null;
  highlighted: FaqPanelEntry[];
  all: FaqPanelEntry[];
};
export function buildHelpPanel(input: {
  entries: readonly FaqEntry[]; // bereits nur published
  grants: readonly FaqGrant[];
  pathname: string;
  contextLabels: ReadonlyMap<string, string>; // FAQ_CONTEXTS als key->label
}): FaqHelpPanel;
```

- Semantik: `all` = alle sichtbaren Einträge (für die Mini-Suche). Passt mindestens ein Kontext-Schlüssel der Route zu mindestens einem `contexts`-Eintrag eines sichtbaren Eintrags → `highlighted` = genau diese, `contextLabel` = Label des ersten passenden Schlüssels. Sonst: `highlighted` = die ersten 5 sichtbaren Einträge aus `primarySection(grants)`, `contextLabel: null` (das UI zeigt dafür „Beliebte Fragen" als Panel-Titel-Fallback, nicht diese Funktion).

- [ ] **Step 1: Failing Tests**

```ts
import { describe, expect, it } from "vitest";
import { buildHelpPanel } from "./panel";
import type { FaqEntry } from "@bdas/faq";

const entry = (over: Partial<FaqEntry>): FaqEntry => ({
  id: "e",
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "F?",
  body: { type: "doc", content: [] },
  youtubeId: null,
  status: "published",
  position: 0,
  updatedAt: new Date("2026-09-01"),
  updatedBy: null,
  relatedIds: [],
  contexts: [],
  ...over,
});
const labels = new Map([
  ["dateien", "Dateien"],
  ["profil", "Profil"],
]);

describe("buildHelpPanel", () => {
  it("highlights entries whose context matches the route, with the label", () => {
    const out = buildHelpPanel({
      entries: [entry({ id: "a", contexts: ["dateien"] }), entry({ id: "b" })],
      grants: [{ role: "member", groupId: null }],
      pathname: "/dateien/ordner-1",
      contextLabels: labels,
    });
    expect(out.contextLabel).toBe("Dateien");
    expect(out.highlighted.map((e) => e.id)).toEqual(["a"]);
    expect(out.all.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("falls back to the viewer's primary section, capped at 5, when nothing matches", () => {
    const entries = Array.from({ length: 7 }, (_, i) => entry({ id: `m${i}` }));
    const out = buildHelpPanel({
      entries,
      grants: [{ role: "member", groupId: null }],
      pathname: "/irgendwo",
      contextLabels: labels,
    });
    expect(out.contextLabel).toBeNull();
    expect(out.highlighted).toHaveLength(5);
  });

  it("respects visibility — a hidden entry never appears in all or highlighted", () => {
    const out = buildHelpPanel({
      entries: [entry({ id: "hidden", section: "bundesvorstand", contexts: ["dateien"] })],
      grants: [{ role: "member", groupId: null }],
      pathname: "/dateien",
      contextLabels: labels,
    });
    expect(out.all).toEqual([]);
    expect(out.highlighted).toEqual([]);
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run lib/faq/panel.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

```ts
import type { FaqEntry } from "@bdas/faq";

import { isEntryVisible } from "./assemble";
import { matchContextsForPath } from "./contexts";
import { plainText } from "./plain-text";
import { primarySection, type FaqGrant } from "./order";

export type FaqPanelEntry = {
  id: string;
  question: string;
  body: unknown;
  searchText: string;
  youtubeId: string | null;
};

export type FaqHelpPanel = {
  contextLabel: string | null;
  highlighted: FaqPanelEntry[];
  all: FaqPanelEntry[];
};

const FALLBACK_LIMIT = 5;

function toPanelEntry(e: FaqEntry): FaqPanelEntry {
  return {
    id: e.id,
    question: e.question,
    body: e.body,
    searchText: `${e.question} ${plainText(e.body)}`.trim().toLowerCase(),
    youtubeId: e.youtubeId,
  };
}

export function buildHelpPanel(input: {
  entries: readonly FaqEntry[];
  grants: readonly FaqGrant[];
  pathname: string;
  contextLabels: ReadonlyMap<string, string>;
}): FaqHelpPanel {
  const visible = input.entries.filter((e) => isEntryVisible(e, input.grants));
  const all = visible.map(toPanelEntry);

  const matchedKeys = matchContextsForPath(input.pathname);
  const contextual = visible.filter((e) => matchedKeys.some((k) => e.contexts.includes(k)));

  if (contextual.length > 0) {
    const label = matchedKeys.map((k) => input.contextLabels.get(k)).find((l) => l != null) ?? null;
    return { contextLabel: label, highlighted: contextual.map(toPanelEntry), all };
  }

  const primary = primarySection(input.grants);
  const fallback = visible.filter((e) => e.section === primary).slice(0, FALLBACK_LIMIT);
  return { contextLabel: null, highlighted: fallback.map(toPanelEntry), all };
}
```

- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run lib/faq/panel.test.ts && pnpm --filter web typecheck` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/panel.ts apps/web/lib/faq/panel.test.ts
git commit -m "feat(faq): reine Hilfe-Panel-Logik — Kontext-Match, Sichtbarkeit, Fallback"
```

---

### Task 4: Route-Handler `GET /api/faq/help`

**Files:**

- Create: `apps/web/app/api/faq/help/route.ts`

**Interfaces:**

- Consumes: `getDb` aus `@bdas/db`; `listEntries` aus `@bdas/faq`; `isFlagOn` aus `@bdas/feature-flags`; `getCurrentMember` aus `@bdas/members`; `readSessionCookie` aus `../../../../lib/auth-cookie`; `FAQ_CONTEXTS` aus `../../../../lib/faq/contexts`; `buildHelpPanel` aus `../../../../lib/faq/panel`.
- Produces: `GET` — `200` mit `FaqHelpPanel`-JSON bei gültiger Session, `401` ohne Session, `404` wenn `faq_suite` aus ist.

- [ ] **Step 1: Datei schreiben.**

```ts
import { getDb } from "@bdas/db";
import { listEntries } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../../lib/auth-cookie";
import { FAQ_CONTEXTS } from "../../../../lib/faq/contexts";
import { buildHelpPanel } from "../../../../lib/faq/panel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isFlagOn("faq_suite")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const pathname = new URL(req.url).searchParams.get("path") ?? "/";
  const entries = await listEntries(getDb(), { status: "published" });
  const contextLabels = new Map(FAQ_CONTEXTS.map((c) => [c.key, c.label]));
  const panel = buildHelpPanel({ entries, grants: me.grants, pathname, contextLabels });
  return Response.json(panel);
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün. (Keine eigene Unit-Test-Datei: die Logik ist in Task 3 vollständig getestet, dieser Handler ist reines I/O; das Zusammenspiel prüft Task 7 per E2E.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/faq/help/route.ts
git commit -m "feat(faq): Route-Handler für das Hilfe-Panel"
```

---

### Task 5: Hilfe-Panel-Button + Gate, im Root-Layout montiert

**Files:**

- Create: `apps/web/app/_faq/HelpPanelGate.tsx`, `apps/web/app/_faq/HelpPanelButton.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**

- Consumes: `isFlagOn` aus `@bdas/feature-flags`; `loadViewer` aus `../_dashboard/session`; `Dialog, Input` aus `@bdas/design-system`; `FaqRichText, YouTubeFacade, highlightMatches` aus `../faq/{FaqRichText,YouTubeFacade,highlight}`; `FaqSubmissionDialog` aus `../faq/FaqSubmissionDialog`; `type FaqHelpPanel` aus `../../lib/faq/panel`; `usePathname` aus `next/navigation`.
- Produces: `<HelpPanelGate />` (Server, kein Props) und `<HelpPanelButton />` (Client, kein Props).

- [ ] **Step 1: `HelpPanelGate.tsx` schreiben** — rendert nichts ohne Flag oder ohne angemeldeten Viewer (Spec §7 „Abgrenzung"), sonst den Client-Button:

```tsx
import { isFlagOn } from "@bdas/feature-flags";

import { loadViewer } from "../_dashboard/session";
import { HelpPanelButton } from "./HelpPanelButton";

export async function HelpPanelGate() {
  if (!isFlagOn("faq_suite")) return null;
  const viewer = await loadViewer();
  if (!viewer) return null;
  return <HelpPanelButton />;
}
```

- [ ] **Step 2: `HelpPanelButton.tsx` schreiben** — lazy Fetch beim ersten Öffnen, Refetch bei Routenwechsel, Mini-Suche über `panel.all`, Fallback-Titel „Beliebte Fragen":

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Dialog, Input } from "@bdas/design-system";

import type { FaqHelpPanel } from "../../lib/faq/panel";
import { FaqRichText } from "../faq/FaqRichText";
import { FaqSubmissionDialog } from "../faq/FaqSubmissionDialog";
import { highlightMatches } from "../faq/highlight";
import { YouTubeFacade } from "../faq/YouTubeFacade";

export function HelpPanelButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<FaqHelpPanel | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  // A route change invalidates whatever the panel showed for the last route —
  // the next open must re-fetch, not show stale contextual entries.
  useEffect(() => {
    setPanel(null);
  }, [pathname]);

  useEffect(() => {
    if (!open || panel || loading) return;
    setLoading(true);
    fetch(`/api/faq/help?path=${encodeURIComponent(pathname)}`)
      .then((r) => (r.ok ? (r.json() as Promise<FaqHelpPanel>) : null))
      .then(setPanel)
      .finally(() => setLoading(false));
  }, [open, panel, loading, pathname]);

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;
  const shown = searching
    ? (panel?.all.filter((e) => e.searchText.includes(normalizedQuery)) ?? [])
    : (panel?.highlighted ?? []);
  const title = panel?.contextLabel ?? "Beliebte Fragen";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Hilfe öffnen"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-bdas-full bg-bdas-red text-2xl font-bold text-bdas-surface shadow-bdas-dropdown transition-transform duration-bdas-quick ease-bdas hover:scale-105"
      >
        ?
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={searching ? "Suche" : title}>
        <div className="flex flex-col gap-3">
          {loading && <p className="text-sm text-bdas-ink-muted">Lädt…</p>}
          {!loading && shown.length === 0 && (
            <p className="text-sm text-bdas-ink-muted">Keine Einträge gefunden.</p>
          )}
          {!loading &&
            shown.map((entry) => (
              <details key={entry.id} className="bdas-accordion">
                <summary>{highlightMatches(entry.question, normalizedQuery)}</summary>
                <div>
                  <FaqRichText doc={entry.body} />
                  {entry.youtubeId ? (
                    <YouTubeFacade youtubeId={entry.youtubeId} title={entry.question} />
                  ) : null}
                </div>
              </details>
            ))}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FAQ durchsuchen"
            aria-label="FAQ durchsuchen"
          />
          <div className="flex items-center justify-between text-sm">
            <a href="/faq" className="text-bdas-ink-body hover:text-bdas-red">
              Alle FAQ ansehen
            </a>
            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              className="text-bdas-ink-body hover:text-bdas-red"
            >
              Frage einreichen
            </button>
          </div>
        </div>
      </Dialog>
      <FaqSubmissionDialog open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </>
  );
}
```

- [ ] **Step 3: In `layout.tsx` montieren** — Import ergänzen und `<HelpPanelGate />` nach `<CookieNotice ... />` einfügen:

```tsx
import { HelpPanelGate } from "./_faq/HelpPanelGate";
// ...
        <CookieNotice privacyUrl={privacy} />
        <HelpPanelGate />
      </body>
```

- [ ] **Step 4: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_faq/HelpPanelGate.tsx apps/web/app/_faq/HelpPanelButton.tsx apps/web/app/layout.tsx
git commit -m "feat(faq): globales Hilfe-Panel mit Kontext-Match und Mini-Suche"
```

---

### Task 6: `<FaqHinweis>` — gezielte Einbettung

**Files:**

- Create: `apps/web/app/_faq/FaqHinweis.tsx`
- Modify: `apps/web/app/admin/events/neu/page.tsx`

**Interfaces:**

- Consumes: `getDb` aus `@bdas/db`; `listEntriesByContext` aus `@bdas/faq`; `isFlagOn` aus `@bdas/feature-flags`; `isEntryVisible` aus `../../lib/faq/assemble`; `loadCurrentMember` aus `../_dashboard/session`; `FaqRichText` aus `../faq/FaqRichText`.
- Produces: `<FaqHinweis context={string} />` — Server Component, `null` ohne Flag/Session/passende Einträge.

- [ ] **Step 1: `FaqHinweis.tsx` schreiben.**

```tsx
import { getDb } from "@bdas/db";
import { listEntriesByContext } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";

import { isEntryVisible } from "../../lib/faq/assemble";
import { loadCurrentMember } from "../_dashboard/session";
import { FaqRichText } from "../faq/FaqRichText";

const MAX_ENTRIES = 3;

/** Kompaktes Accordion für eine feste Kontext-Stelle (Spec §7 "Gezielte
 *  Einbettung") — sparsam einsetzen, das Panel (Task 5) ist der Standardweg. */
export async function FaqHinweis({ context }: { context: string }) {
  if (!isFlagOn("faq_suite")) return null;
  const me = await loadCurrentMember();
  if (!me) return null;

  const entries = (await listEntriesByContext(getDb(), context))
    .filter((e) => isEntryVisible(e, me.grants))
    .slice(0, MAX_ENTRIES);
  if (entries.length === 0) return null;

  return (
    <aside className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <h2 className="text-sm font-bold text-bdas-ink">Häufige Fragen</h2>
      {entries.map((entry) => (
        <details key={entry.id} className="bdas-accordion">
          <summary>{entry.question}</summary>
          <FaqRichText doc={entry.body} />
        </details>
      ))}
      <a href="/faq" className="text-sm font-semibold text-bdas-red hover:underline">
        Mehr im FAQ
      </a>
    </aside>
  );
}
```

- [ ] **Step 2: Einen realen Einsatzort verdrahten** — `apps/web/app/admin/events/neu/page.tsx` öffnen, die Datei-Struktur ansehen und `<FaqHinweis context="events.erstellen" />` oberhalb des Formulars einfügen (Import `import { FaqHinweis } from "../../_faq/FaqHinweis";` relativ zum tatsächlichen Pfad der Datei anpassen — `admin/events/neu/` ist zwei Ebenen unter `app/admin/events/`, also `../../../_faq/FaqHinweis` von `app/admin/events/neu/page.tsx` aus).

- [ ] **Step 3: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_faq/FaqHinweis.tsx apps/web/app/admin/events/neu/page.tsx
git commit -m "feat(faq): FaqHinweis-Einbettung bei Event erstellen"
```

---

### Task 7: E2E + Security-Review-Hinweis + PR

**Files:**

- Modify: `e2e/faq.e2e.ts`

- [ ] **Step 1: Hilfe-Panel testen** — an `e2e/faq.e2e.ts` anhängen:

```ts
test.describe("Kontextuelle Hilfe", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("the help panel shows contextual entries on a matching route and a fallback elsewhere", async ({
    page,
  }) => {
    const email = "faq-help@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Hilfe" });

    // Kein Kontext-Match auf /account → Fallback-Titel "Beliebte Fragen".
    await page.goto("/account");
    await page.getByRole("button", { name: "Hilfe öffnen" }).click();
    await expect(page.getByRole("heading", { name: "Beliebte Fragen" })).toBeVisible();
    await page.getByRole("button", { name: "Schließen" }).click();

    // /profil ist im Kontext-Register hinterlegt → eigener Panel-Titel.
    await page.goto("/profil");
    await page.getByRole("button", { name: "Hilfe öffnen" }).click();
    await expect(page.getByRole("heading", { name: "Profil" })).toBeVisible();

    // Mini-Suche filtert über alle sichtbaren Einträge, nicht nur die Kontext-Treffer.
    await page.getByPlaceholder("FAQ durchsuchen").fill("Gruppe");
    await expect(page.locator("mark").first()).toBeVisible();
  });

  test("a guest sees no help button", async ({ page }) => {
    await page.goto("/gruppen");
    await expect(page.getByRole("button", { name: "Hilfe öffnen" })).toBeHidden();
  });
});
```

- [ ] **Step 2: Lokal grün** — Run: `pnpm exec playwright test e2e/faq.e2e.ts` (mit laufender DB, `faq_suite`-Flag) → PASS.

- [ ] **Step 3: Commit + Push + PR**

```bash
git add e2e/faq.e2e.ts
git commit -m "feat(faq): E2E für das kontextuelle Hilfe-Panel"
git push
gh pr create --title "feat(faq): Kontextuelle Hilfe / Oktopus (FAQ-Suite v2, PR 5)" --body "$(cat <<'EOF'
FAQ-Suite v2, PR 5 von 5 — letzter PR der Suite (Spec: docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md §7, §9).

- Schwebender "?"-Button auf jeder eingeloggten Seite, einmalig im Root-Layout montiert
- Panel-Inhalt lazy über GET /api/faq/help — Session- und kontextgefiltert, kein Payload auf jeder Seite
- Kontext-Register (PR 3) um Routen-Muster erweitert; "Beliebte Fragen"-Fallback ohne Match
- Mini-Suche über alle sichtbaren Einträge, Sprung zu /faq, Einreichen-Dialog aus PR 4
- <FaqHinweis context="…" /> für gezielte Einbettung, verdrahtet bei "Event erstellen"

⚠️ Berührt Berechtigungen (Sichtbarkeitsfilterung außerhalb von /faq) — /security-review vor Merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Danach `/review` **und** `/security-review` auf den PR. Nach Merge: `/ultrareview` als Phasen-Abschluss der gesamten FAQ-Suite v2 (CLAUDE.md §4: „Phase boundaries get /ultrareview").

---

## Self-Review (erledigt)

- Spec §7 abgedeckt: globales Panel, einmal montiert, Backdrop-Dialog ✓ (T5); Kontext-Match über das Register ✓ (T1, T3); Sichtbarkeit wie `/faq` ✓ (T2, T3 nutzen `isEntryVisible`); Mini-Suche über alle sichtbaren Einträge ✓ (T5); „Alle FAQ ansehen" + „Frage einreichen" mit Zugriff auf PR 4s Dialog ✓ (T5); lazy über Route-Handler, kein Payload pro Seite ✓ (T4, Fetch nur bei `open`); „Beliebte Fragen"-Fallback ✓ (T3, T5); `<FaqHinweis>` kompakt, max. 3, „Mehr im FAQ"-Link, sparsam an einer realen Stelle verdrahtet ✓ (T6); nur eingeloggte Flächen ✓ (T5 Gate + T4 401, doppelt abgesichert).
- Platzhalter: keine offenen; der genaue relative Importpfad in T6 Step 2 wird explizit vorgerechnet, da er von der tatsächlichen Verschachtelungstiefe der Zieldatei abhängt.
- Typkonsistenz: `FaqHelpPanel`/`FaqPanelEntry` identisch in T3 (Definition), T4 (Rückgabewert des Handlers), T5 (`HelpPanelButton`s State-Typ). `FaqContext` mit `pattern` in T1 bricht PR 3s `FaqEntryDialog.tsx` nicht (dort nur `key`/`label` gelesen — in T1 Step 4 per Typecheck verifiziert).
- Abhängigkeit: Plan setzt PR-1–4-Merge voraus (Global Constraints, Satz 1); dies ist laut Spec §9 der letzte PR der Suite — nach Merge ist `/ultrareview` als Phasenabschluss fällig (CLAUDE.md §4).
