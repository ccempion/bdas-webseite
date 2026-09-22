# FAQ-Suite v2 — PR 2: Lese-Erlebnis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/faq` wird hinter dem Flag `faq_suite` zum vollflächigen Docs-Layout aus der DB — Sticky-Rail, Client-Suche mit Highlight, Deep-Links, klick-aktivierte YouTube-Embeds — plus die neue `Dialog`-Primitive im Design-System.

**Architecture:** Die Seite bleibt Server Component: sie lädt `listEntries` + `listTopics` aus `@bdas/faq`, filtert per bestehender Sichtbarkeitslogik (`apps/web/lib/faq`, auf DB-Zeilen umgestellt) und reicht serialisierbare View-Daten an eine Client-Shell (`FaqExplorer`), die Suche/Filter/Scroll-Spy hält. Flag aus → exakt die heutige statische Seite (Code bleibt unangetastet daneben liegen). Antwort-Bodies rendert das vorhandene `renderRichText` aus `apps/web/app/_content/rich-text.tsx`.

**Tech Stack:** Next.js 14 App Router, React Client Components für Suche/Rail, Tailwind + Design-Tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md` (§5, §6 „Dialog“-Primitive, §10)

## Global Constraints

- Voraussetzung: **PR 1 ist gemerged** — `@bdas/faq` existiert mit der in dessen Plan definierten Oberfläche (`listEntries`, `listTopics`, `FaqEntry`, `FaqTopic`).
- CLAUDE.md §7: keine Inline-Hex/Radius/Schatten/Dauer — nur Token-Klassen (`rounded-bdas`, `text-bdas-ink`, `duration-bdas-quick`, `bdas-accordion`, …). Fehlt ein Token: melden, nicht erfinden.
- Sichtbarkeit: ausschließlich über `isVisibleTo`/`narrowSubgroups`-Äquivalente in `apps/web/lib/faq`; der Client bekommt **nur** bereits gefilterte Einträge.
- Kein YouTube-Request vor Klick; iframe-Host ausschließlich `www.youtube-nocookie.com`.
- Nur veröffentlichte Einträge (`status === "published"`) erreichen die Seite.
- Alle UI-Texte deutsch. Vor jedem Commit Prettier auf die geänderten Dateien.

## File Structure

```
apps/web/lib/faq/
  assemble.ts        DB-Zeilen → View-Modell (Bereiche/Untergruppen, Sichtbarkeit, Sortierung)
  assemble.test.ts
  plain-text.ts      Tiptap-Doc → Suchtext (rekursiv text-Knoten einsammeln)
  plain-text.test.ts
  youtube.ts         youtubeThumbnailUrl(id), youtubeEmbedUrl(id)
  youtube.test.ts
apps/web/app/faq/
  page.tsx           Verzweigung Flag; neue Datenladung; alte Renderpfad bleibt
  FaqExplorer.tsx    Client-Shell: Suche, Themenfilter, Rail, Scroll-Spy, Hash-Open
  FaqEntryCard.tsx   Eintrag: Accordion, Chips, Datum, Copy-Link, Video
  FaqRichText.tsx    dünner Wrapper um renderRichText
  YouTubeFacade.tsx  Click-to-load-Embed
  highlight.tsx      highlightMatches(text, query): ReactNode  (+ .test.tsx)
core/design-system/src/components/
  Dialog.tsx         Primitive (Backdrop, Fokus-Falle, Esc)  (+ Dialog.test.tsx)
e2e/faq.e2e.ts       erweitert (neues Layout, Suche)
docs/datenschutz/    ein Eintrag zur YouTube-Fassade (Bestandsaufnahme ergänzen)
.github/workflows/ci.yml + playwright.config.ts   BDAS_FLAG_FAQ_SUITE=true
```

Der alte Pfad (`FaqSection.tsx`, `FaqAccordion.tsx`, `content/faq/`) bleibt unverändert — er ist der Flag-aus-Fallback und fliegt erst im Aufräum-PR.

---

### Task 1: View-Modell `assemble.ts` (TDD)

**Files:**

- Create: `apps/web/lib/faq/assemble.ts`, `apps/web/lib/faq/plain-text.ts`
- Test: `apps/web/lib/faq/assemble.test.ts`, `apps/web/lib/faq/plain-text.test.ts`

**Interfaces:**

- Consumes: `FaqEntry, FaqTopic, FaqSectionKey` aus `@bdas/faq`; `FaqGrant, orderSections, highlightedVorstandSubgroups` aus `./order`; `hasAny` aus `./visibility`.
- Produces (der Serialisierungsvertrag Server → Client; **nur Plain-Objekte, keine Date-Instanzen**):

```ts
export type FaqEntryView = {
  id: string;
  question: string;
  body: unknown; // TiptapDoc, gerendert via FaqRichText
  searchText: string; // question + plainText(body), lowercase
  topic: { id: string; name: string } | null;
  youtubeId: string | null;
  updatedAtIso: string; // für "Zuletzt aktualisiert"
  relatedIds: readonly string[];
};
export type FaqSubgroupView = {
  id: string;
  title: string;
  highlighted: boolean;
  entries: FaqEntryView[];
};
export type FaqSectionView = {
  key: FaqSectionKey;
  title: string;
  intro: string | null;
  defaultOpen: boolean;
  entries: FaqEntryView[];
  subgroups: FaqSubgroupView[];
};
export function assembleFaq(input: {
  entries: readonly FaqEntry[]; // bereits nur published
  topics: readonly FaqTopic[];
  grants: readonly FaqGrant[];
}): { sections: FaqSectionView[]; topics: { id: string; name: string }[] };
```

- Semantik: Bereichs-Titel/Intros und Untergruppen-Titel kommen aus einer lokalen Konstante `SECTION_META` in `assemble.ts` (Titel wie heute: „Allgemein“, „Bundesvorstand“, „Vorstand“, „Mitglieder“; Untergruppen „LEAD“, „Vorstand“, „Event Organisator“, „Seiten Editor“ — aus `apps/web/content/faq/*.ts` übernehmen). Sichtbarkeit: Bereich `bundesvorstand` nur bei `federal_board`-Grant; Untergruppen nur bei passendem Grant (Regeln 1:1 aus `visibility.ts` — `isVisibleTo`/`narrowSubgroups` arbeiten auf dem statischen Typ, daher hier direkt `hasAny` verwenden). Reihenfolge + `defaultOpen` via `orderSections(grants)`; leere Bereiche (keine sichtbaren Einträge) fliegen raus. `topics` im Ergebnis: nur Themen, die an mindestens einem sichtbaren Eintrag hängen.
- `plain-text.ts`: `export function plainText(doc: unknown): string` — rekursiv alle `text`-Felder einsammeln, mit Leerzeichen joinen, Whitespace kollabieren.

- [ ] **Step 1: Failing Tests schreiben**

`plain-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plainText } from "./plain-text";

describe("plainText", () => {
  it("collects nested text nodes", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hallo" }] },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Welt" }] }],
            },
          ],
        },
      ],
    };
    expect(plainText(doc)).toBe("Hallo Welt");
  });
  it("is empty for garbage", () => {
    expect(plainText(null)).toBe("");
    expect(plainText({ type: "doc" })).toBe("");
  });
});
```

`assemble.test.ts` — Fixtures als `FaqEntry`-Plainobjekte (`updatedAt: new Date("2026-09-01")`, `status: "published"`), Fälle:

```ts
import { describe, expect, it } from "vitest";
import { assembleFaq } from "./assemble";

const entry = (over: Partial<Parameters<typeof assembleFaq>[0]["entries"][number]>) => ({
  id: "e1",
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

describe("assembleFaq", () => {
  it("hides bundesvorstand from a plain member and drops empty sections", () => {
    const { sections } = assembleFaq({
      entries: [entry({ id: "b1", section: "bundesvorstand" }), entry({ id: "m1" })],
      topics: [],
      grants: [{ role: "member", groupId: null }],
    });
    expect(sections.map((s) => s.key)).toEqual(["mitglieder"]);
  });

  it("puts the primary section first and open; subgroup highlighted for own grant", () => {
    const { sections } = assembleFaq({
      entries: [
        entry({ id: "v1", section: "vorstand", subgroup: "local_board_lead" }),
        entry({ id: "m1" }),
      ],
      topics: [],
      grants: [{ role: "local_board_lead", groupId: "g1" }],
    });
    expect(sections[0]!.key).toBe("vorstand");
    expect(sections[0]!.defaultOpen).toBe(true);
    expect(sections[0]!.subgroups[0]!.highlighted).toBe(true);
  });

  it("only lists topics attached to visible entries; searchText is lowercased", () => {
    const { sections, topics } = assembleFaq({
      entries: [entry({ id: "m1", topicId: "t1", question: "Wie GEHT das?" })],
      topics: [
        { id: "t1", name: "Events", position: 0 },
        { id: "t2", name: "Unbenutzt", position: 1 },
      ],
      grants: [{ role: "member", groupId: null }],
    });
    expect(topics).toEqual([{ id: "t1", name: "Events" }]);
    expect(sections[0]!.entries[0]!.searchText).toContain("wie geht das?");
  });

  it("a viewer with a vorstand grant does not see another subgroup's entries", () => {
    const { sections } = assembleFaq({
      entries: [entry({ id: "v1", section: "vorstand", subgroup: "page_editor" })],
      topics: [],
      grants: [{ role: "local_board_lead", groupId: "g1" }],
    });
    expect(sections.find((s) => s.key === "vorstand")).toBeUndefined();
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `cd apps/web && pnpm vitest run lib/faq/assemble.test.ts lib/faq/plain-text.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `plain-text.ts` (~15 Zeilen Rekursion); `assemble.ts` (~120 Zeilen): `SECTION_META` (Titel/Intros/Untergruppen-Titel aus den statischen Dateien kopieren), Gruppierung `entries` nach `section`/`subgroup`, Sichtbarkeitsregeln wie oben, `orderSections` für Reihenfolge/`defaultOpen`, `highlightedVorstandSubgroups` für `highlighted`, Topic-Map, `searchText = (question + " " + plainText(body)).toLowerCase()`, `updatedAtIso = updatedAt.toISOString()`.

- [ ] **Step 4: PASS sehen**, dann bestehende Alt-Tests absichern: `pnpm vitest run lib/faq` → alle grün (alte `order.test.ts`/`visibility.test.ts` bleiben unberührt).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/assemble.ts apps/web/lib/faq/assemble.test.ts apps/web/lib/faq/plain-text.ts apps/web/lib/faq/plain-text.test.ts
git commit -m "feat(faq): View-Modell — DB-Zeilen nach Sichtbarkeit und Reihenfolge"
```

---

### Task 2: YouTube-Helfer + Fassade (TDD)

**Files:**

- Create: `apps/web/lib/faq/youtube.ts`, Test: `apps/web/lib/faq/youtube.test.ts`
- Create: `apps/web/app/faq/YouTubeFacade.tsx`

**Interfaces:**

- Produces:
  - `youtubeThumbnailUrl(id: string): string` → `https://i.ytimg.com/vi/<id>/hqdefault.jpg` — **Achtung:** auch das Thumbnail ist ein Google-Request; die Fassade rendert es deshalb **nicht** per `<img src>`, sondern einen neutralen Platzhalter aus Tokens (Play-Dreieck auf `bg-bdas-surface`). Der Helfer existiert für den Board-Editor (PR 3, Vorschau nach explizitem Einfügen). In PR 2 wird er nur getestet, nicht auf der Leseseite verwendet.
  - `youtubeEmbedUrl(id: string): string` → `https://www.youtube-nocookie.com/embed/<id>?rel=0&modestbranding=1`
  - `<YouTubeFacade youtubeId={string} title={string} />` — Client Component: vor Klick ein `<button>` (16:9-Box, Platzhalter, „Video laden — es gilt die Datenschutzerklärung von YouTube“), nach Klick das `<iframe src={youtubeEmbedUrl(id)} title={title} allowFullScreen loading="lazy" allow="encrypted-media; picture-in-picture" />`.

- [ ] **Step 1: Failing Test** (`youtube.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "./youtube";

describe("youtube urls", () => {
  it("builds nocookie embed and thumbnail urls", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
```

- [ ] **Step 2: FAIL**, **Step 3: beide Dateien implementieren** — `YouTubeFacade.tsx`:

```tsx
"use client";

import { useState } from "react";

import { youtubeEmbedUrl } from "../../lib/faq/youtube";

/** Kein Request an Google vor dem Klick (Spec §5). */
export function YouTubeFacade({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [active, setActive] = useState(false);
  if (active) {
    return (
      <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-bdas">
        <iframe
          src={youtubeEmbedUrl(youtubeId)}
          title={title}
          allowFullScreen
          loading="lazy"
          allow="encrypted-media; picture-in-picture"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      className="relative mb-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-bdas-pill bg-bdas-red text-white">
        <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="absolute bottom-3 left-0 right-0 px-4 text-center text-sm text-bdas-ink-muted">
        Video-Tutorial laden — dabei gilt die Datenschutzerklärung von YouTube
      </span>
    </button>
  );
}
```

(Existiert `bg-bdas-overlay-hover` nicht: in `tailwind-preset.ts` nach der Hover-Fläche greppen, die `FilterChip` nutzt, und exakt diese Klasse nehmen.)

- [ ] **Step 4: PASS** — Run: `pnpm vitest run lib/faq/youtube.test.ts` → PASS; `pnpm --filter web typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/youtube.ts apps/web/lib/faq/youtube.test.ts apps/web/app/faq/YouTubeFacade.tsx
git commit -m "feat(faq): YouTube-Nocookie-Fassade — kein Request vor Klick"
```

---

### Task 3: Suche-Highlight (TDD)

**Files:**

- Create: `apps/web/app/faq/highlight.tsx`, Test: `apps/web/app/faq/highlight.test.tsx`

**Interfaces:**

- Produces: `highlightMatches(text: string, query: string): ReactNode` — case-insensitive; Treffer in `<mark className="rounded-bdas-sm bg-bdas-red/15 px-0.5">`; leere Query → Text unverändert; Regex-Sonderzeichen in der Query escapen.

- [ ] **Step 1: Failing Test** (Rendering via `renderToStaticMarkup` aus `react-dom/server`, wie es `PublicHeaderView.test.tsx` vormacht — dort Muster nachschlagen):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { highlightMatches } from "./highlight";

describe("highlightMatches", () => {
  it("wraps case-insensitive matches in <mark>", () => {
    const out = renderToStaticMarkup(<>{highlightMatches("Wie geht das Wieder?", "wie")}</>);
    expect(out.match(/<mark/g)).toHaveLength(2);
    expect(out).toContain("geht das");
  });
  it("escapes regex chars and passes empty query through", () => {
    expect(renderToStaticMarkup(<>{highlightMatches("a+b", "a+")}</>)).toContain("<mark");
    expect(renderToStaticMarkup(<>{highlightMatches("Text", "")}</>)).toBe("Text");
  });
});
```

- [ ] **Step 2: FAIL**, **Step 3: implementieren** (split auf `new RegExp(`(${escaped})`, "gi")`, ungerade Indizes → `<mark>`), **Step 4: PASS**, **Step 5: Commit**

```bash
git add apps/web/app/faq/highlight.tsx apps/web/app/faq/highlight.test.tsx
git commit -m "feat(faq): Treffer-Hervorhebung für die Suche"
```

---

### Task 4: `Dialog`-Primitive im Design-System (TDD)

**Files:**

- Create: `core/design-system/src/components/Dialog.tsx`, Test: `core/design-system/src/components/Dialog.test.tsx`
- Modify: `core/design-system/src/index.ts` (Export ergänzen — Muster: wie `Alert`/`Card` dort exportiert werden)

**Interfaces:**

- Produces:

```tsx
export type DialogProps = {
  open: boolean;
  onClose: () => void; // Esc, Backdrop-Klick, Close-Button
  title: string; // sichtbarer Titel, verdrahtet mit aria-labelledby
  children: ReactNode;
  wide?: boolean; // max-w-lg (default) | max-w-2xl (Editor-Formulare PR 3)
};
export function Dialog(props: DialogProps): ReactNode;
```

- Implementierung auf dem nativen `<dialog>`-Element: `useRef<HTMLDialogElement>`, `useEffect` ruft `showModal()`/`close()` je nach `open` (native Fokus-Falle + Esc gratis; `onCancel`-Event → `onClose`). Backdrop-Klick: `onClick` auf dem `<dialog>` selbst, nur wenn `e.target === dialogRef.current` (Klick aufs Backdrop, nicht in den Inhalt) → `onClose`. Styling: Karte `rounded-bdas bg-bdas-surface p-6 shadow-bdas-lg` (Schatten-Token in `tailwind-preset.ts` nachschlagen — den Karten-Schatten nehmen), `::backdrop` via Tailwind-Klasse `backdrop:bg-black/50`; Einblendung `duration-bdas-slow` nur als `motion-safe:`-Variante (CLAUDE.md §7, `prefers-reduced-motion`). Close-Button oben rechts (`aria-label="Schließen"`, ×). Die „Nachfrage bei ungespeicherten Änderungen“ aus Spec §6 ist Sache des aufrufenden Formulars (PR 3), nicht der Primitive.

- [ ] **Step 1: Failing Test** — jsdom (`@vitest-environment jsdom`-Pragma, falls das Paket nicht ohnehin jsdom nutzt — in `core/design-system` nach bestehenden `.test.tsx` schauen; gibt es dort nur Node-Tests, das Pragma an den Dateikopf):

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(cleanup);

describe("Dialog", () => {
  it("renders title and children when open, nothing when closed", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Frage einreichen">
        <p>Inhalt</p>
      </Dialog>,
    );
    expect(screen.getByText("Frage einreichen")).toBeTruthy();
    rerender(
      <Dialog open={false} onClose={() => {}} title="Frage einreichen">
        <p>Inhalt</p>
      </Dialog>,
    );
    expect(screen.queryByText("Inhalt")).toBeNull();
  });
  it("close button fires onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <p>x</p>
      </Dialog>,
    );
    screen.getByLabelText("Schließen").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

(jsdom implementiert `showModal()` seit v24; wirft es dennoch, im Test `HTMLDialogElement.prototype.showModal ??= function(){ this.open = true; }` stubben — als Setup-Zeilen im Testfile, mit Kommentar. `@testing-library/react` ggf. als devDependency des Pakets ergänzen — vorher prüfen, ob es im Workspace-Root schon hängt.)

- [ ] **Step 2: FAIL**, **Step 3: implementieren** (bei `open={false}` `null` rendern statt ein geschlossenes `<dialog>` im DOM zu lassen — macht den Test trivial korrekt), **Step 4: PASS** — Run: `pnpm --filter @bdas/design-system test`, **Step 5: Commit**

```bash
git add core/design-system/src/components/Dialog.tsx core/design-system/src/components/Dialog.test.tsx core/design-system/src/index.ts
git commit -m "feat(design-system): Dialog-Primitive auf nativem <dialog>"
```

---

### Task 5: Eintrags-Karte + RichText-Wrapper

**Files:**

- Create: `apps/web/app/faq/FaqRichText.tsx`, `apps/web/app/faq/FaqEntryCard.tsx`

**Interfaces:**

- Consumes: `renderRichText` aus `../_content/rich-text` (exportiert, nimmt `doc: unknown`, rendert defensiv); `FaqEntryView` aus `../../lib/faq/assemble`; `highlightMatches`; `YouTubeFacade`; `Badge` aus `@bdas/design-system`.
- Produces:

```tsx
export function FaqRichText({ doc }: { doc: unknown }): ReactNode; // <div className="text-bdas-ink-body [&_a]:underline">{renderRichText(doc)}</div>

export function FaqEntryCard(props: {
  entry: FaqEntryView;
  query: string; // "" wenn keine Suche aktiv
  forceOpen: boolean; // Suche mit Treffer oder Hash-Ziel
  defaultOpen: boolean;
  onCopyLink: (id: string) => void; // schreibt `${location.origin}/faq#${id}` in die Zwischenablage
  relatedQuestions: ReadonlyArray<{ id: string; question: string }>; // vom Explorer aufgelöst
}): ReactNode;
```

- Aufbau (Client Component): `<details id={entry.id} className="bdas-accordion" open={forceOpen || defaultOpen}>`; `<summary>` = `highlightMatches(entry.question, query)` + Chips rechts (`Badge` für Thema; „Video“-Badge wenn `youtubeId`). Body: `FaqRichText`; darunter `YouTubeFacade` (wenn Video); Fußzeile: „Zuletzt aktualisiert: `new Date(updatedAtIso).toLocaleDateString("de-DE")`“ (deterministisch server/client), Copy-Link-Button (`aria-label="Link kopieren"`), verwandte Fragen als `<a href={`#${id}`}>`-Chips.
- `forceOpen` steuert über das `open`-**Attribut** per `key={entry.id + (forceOpen ? "-f" : "")}`-Remount ODER kontrolliert via `onToggle` + State — die einfache Remount-Variante nehmen und mit Kommentar begründen (unkontrollierte `<details>` ignorieren Prop-Änderungen an `open` nach User-Interaktion).

- [ ] **Step 1: Beide Dateien schreiben** (kein eigener Unit-Test — die Logik steckt in `highlight`/`assemble`/`YouTubeFacade`, alle bereits getestet; das Zusammenspiel testet Task 6 per Explorer-Test und Task 8 per E2E).
- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/faq/FaqRichText.tsx apps/web/app/faq/FaqEntryCard.tsx
git commit -m "feat(faq): Eintrags-Karte mit RichText, Video und Copy-Link"
```

---

### Task 6: `FaqExplorer` — Client-Shell (Rail, Suche, Scroll-Spy, Hash)

**Files:**

- Create: `apps/web/app/faq/FaqExplorer.tsx`
- Test: `apps/web/app/faq/explorer-filter.test.ts` (reine Filterlogik, extrahiert)
- Create: `apps/web/app/faq/explorer-filter.ts`

**Interfaces:**

- Consumes: `FaqSectionView` aus `../../lib/faq/assemble`; `FaqEntryCard`; `FilterChip, Input` aus `@bdas/design-system`; `highlightMatches`.
- Produces:
  - `explorer-filter.ts`: `filterSections(sections: FaqSectionView[], opts: { query: string; topicId: string | null }): FaqSectionView[]` — pure: Query lowercase gegen `entry.searchText` (`includes`), Topic-Match gegen `entry.topic?.id`; Untergruppen/Bereiche ohne verbleibende Einträge entfernen.
  - `<FaqExplorer sections={FaqSectionView[]} topics={{id,name}[]} />` — hält `query`/`topicId`-State; rendert Grid `lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10`; Rail `hidden lg:block sticky top-24 self-start` mit Bereichs-Ankern (`<a href="#bereich-<key>">`, aktiver via Scroll-Spy `IntersectionObserver` auf den Bereichs-`<section id="bereich-<key>">`-Elementen) und Themen-`FilterChip`s; mobil: Suche oben, Chips als `flex gap-2 overflow-x-auto lg:hidden`. Suche: `Input` mit `ref`; `useEffect`-Keydown-Listener: `"/"` außerhalb von Inputs → `ref.current?.focus()` + `preventDefault()`. Hash: `useEffect` liest `window.location.hash` einmal, gibt der Ziel-Karte `forceOpen` und scrollt via `scrollIntoView({ block: "start" })`. Bei aktiver Suche (`query.length > 0`): alle Treffer-Karten `forceOpen`. Related-Auflösung: Map über alle Einträge (`id → question`), an die Karten gereicht. Leerer Filterzustand: „Keine Antwort gefunden.“ + Hinweistext, dass eine Frage über „Frage einreichen“ gestellt werden kann (der Button selbst kommt in PR 4 — hier nur der statische Hinweis, mit `{/* PR 4: Submission-Dialog */}`-Kommentar).

- [ ] **Step 1: Failing Test für die Filterlogik**

```ts
import { describe, expect, it } from "vitest";
import { filterSections } from "./explorer-filter";
import type { FaqSectionView } from "../../lib/faq/assemble";

const entry = (id: string, over: object = {}) => ({
  id,
  question: id,
  body: null,
  searchText: `frage ${id}`,
  topic: null,
  youtubeId: null,
  updatedAtIso: "2026-09-01T00:00:00.000Z",
  relatedIds: [],
  ...over,
});
const sections: FaqSectionView[] = [
  {
    key: "mitglieder",
    title: "Mitglieder",
    intro: null,
    defaultOpen: true,
    entries: [entry("a", { topic: { id: "t1", name: "Events" } }), entry("b")],
    subgroups: [],
  },
];

describe("filterSections", () => {
  it("filters by query against searchText", () => {
    const out = filterSections(sections, { query: "frage a", topicId: null });
    expect(out[0]!.entries.map((e) => e.id)).toEqual(["a"]);
  });
  it("filters by topic and drops emptied sections", () => {
    expect(filterSections(sections, { query: "", topicId: "t1" })[0]!.entries).toHaveLength(1);
    expect(filterSections(sections, { query: "zzz", topicId: null })).toEqual([]);
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run app/faq/explorer-filter.test.ts` → FAIL.
- [ ] **Step 3: `explorer-filter.ts` implementieren, dann `FaqExplorer.tsx`** (~150 Zeilen, wie oben spezifiziert).
- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run app/faq && pnpm --filter web typecheck` → grün.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/faq/explorer-filter.ts apps/web/app/faq/explorer-filter.test.ts apps/web/app/faq/FaqExplorer.tsx
git commit -m "feat(faq): Explorer-Shell — Rail, Suche, Scroll-Spy, Deep-Links"
```

---

### Task 7: `page.tsx` verzweigen

**Files:**

- Modify: `apps/web/app/faq/page.tsx`

**Interfaces:**

- Consumes: `isFlagOn` aus `@bdas/feature-flags`; `listEntries, listTopics` aus `@bdas/faq`; `getDb` aus `@bdas/db`; `assembleFaq`; `FaqExplorer`; bestehende statische Renderfunktion.

- [ ] **Step 1: Umbauen** — der bestehende Body wandert unverändert in eine lokale Funktion `StaticFaq({ me })`; der neue Default-Export:

```tsx
export default async function FaqPage() {
  if (!faqEnabled()) notFound();
  const me = await loadCurrentMember();
  if (!me) redirect("/anmelden");

  if (!isFlagOn("faq_suite")) return <StaticFaq me={me} />;

  const db = getDb();
  const [entries, topics] = await Promise.all([
    listEntries(db, { status: "published" }),
    listTopics(db),
  ]);
  const { sections, topics: usedTopics } = assembleFaq({ entries, topics, grants: me.grants });

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-bdas-ink">FAQ &amp; Hilfe</h1>
        <p className="mt-2 text-bdas-ink-muted">
          Wie die Plattform funktioniert — durchsuchbar, nach Rollen gegliedert.
        </p>
      </header>
      <FaqExplorer sections={sections} topics={usedTopics} />
    </main>
  );
}
```

`export const dynamic = "force-dynamic"` und `metadata` bleiben. `me`-Typ von `loadCurrentMember` für `StaticFaq` übernehmen (Signatur dort nachschlagen).

- [ ] **Step 2: Manuell verifizieren** — Run: `BDAS_FLAG_FAQ=true pnpm --filter web dev`, `/faq` besuchen → alte Seite. Dann zusätzlich `BDAS_FLAG_FAQ_SUITE=true` → neues Layout (DB muss die Migrationen aus PR 1 haben: `docker compose up -d postgres` + Migrations-Runner laufen lassen; Kommando in `infra/migrations/src/cli.ts` Kopfkommentar bzw. dessen package.json-Scripts nachschlagen).
- [ ] **Step 3: Commit**

```bash
git add apps/web/app/faq/page.tsx
git commit -m "feat(faq): /faq hinter faq_suite auf das DB-Layout verzweigen"
```

---

### Task 8: E2E + CI-Flag + Datenschutz-Notiz

**Files:**

- Modify: `e2e/faq.e2e.ts`, `.github/workflows/ci.yml` (Zeile neben `BDAS_FLAG_FAQ: "true"` → `BDAS_FLAG_FAQ_SUITE: "true"`), `playwright.config.ts` (dito neben dem bestehenden `BDAS_FLAG_FAQ`-Eintrag)
- Modify: `docs/datenschutz/` — Bestandsaufnahme um YouTube-Fassaden-Absatz ergänzen (Datei per `ls docs/datenschutz` identifizieren; Absatz: youtube-nocookie, Request erst nach Klick, kein Cookie vor Aktivierung)

- [ ] **Step 1: E2E erweitern** — die zwei bestehenden Tests bleiben; der zweite wird auf das neue Layout angepasst (die Intro-Assertions der alten Version durch Layout-Assertions ersetzen) und ein Suchtest kommt dazu:

```ts
test("a signed-in member sees the docs layout and searches", async ({ page }) => {
  const email = "faq-suche@e2e.bdas.test";
  await deleteUserByEmail(email);
  await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Sucher" });

  await page.goto("/faq");
  await expect(page.getByRole("heading", { level: 1, name: /FAQ & Hilfe/ })).toBeVisible();
  // Rail (Desktop-Viewport der Suite): Bereichs-Anker des Mitglieds sichtbar.
  await expect(page.getByRole("link", { name: "Mitglieder" })).toBeVisible();

  // Suche filtert und hebt hervor: eine Frage aus dem Seed ansuchen.
  await page.getByPlaceholder("Suche").fill("Gruppe");
  await expect(page.locator("mark").first()).toBeVisible();
});
```

(Platzhaltertext des Suchfelds im Explorer exakt „Suche“ nennen, damit dieser Selektor trägt. Der Seed aus PR 1 muss in der CI-DB liegen — der E2E-Job spielt Migrationen bereits ein; prüfen in `.github/workflows/ci.yml` beim `e2e`-Job.)

- [ ] **Step 2: Lokal grün** — Run: `pnpm exec playwright test e2e/faq.e2e.ts` (mit laufender DB + beiden Flags) → PASS.
- [ ] **Step 3: Commit + Push + PR**

```bash
git add e2e/faq.e2e.ts .github/workflows/ci.yml playwright.config.ts docs/datenschutz
git commit -m "feat(faq): E2E für Docs-Layout und Suche; CI-Flag; Datenschutz-Notiz"
git push
gh pr create --title "feat(faq): Lese-Erlebnis — Docs-Layout, Suche, Videos (FAQ-Suite v2, PR 2)" --body "$(cat <<'EOF'
FAQ-Suite v2, PR 2 von 5 (Spec: docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md §5).

- /faq hinter faq_suite: vollflächiges Docs-Layout aus der DB (Rail, Scroll-Spy, Themenfilter)
- Client-Suche mit <mark>-Highlight, "/"-Hotkey, Deep-Links /faq#<id>
- YouTube nur als Click-to-load-Fassade (youtube-nocookie, kein Request vor Klick) + Datenschutz-Notiz
- Neue Dialog-Primitive im Design-System (nativ <dialog>; genutzt ab PR 3/4)
- Flag aus → unveränderte statische Seite

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Danach `/review` auf den PR.

---

## Self-Review (erledigt)

- Spec §5 abgedeckt: Grid/Rail/mobile Chips ✓ (T6), Accordion-Idiom + Chips/Datum/Copy-Link/Related ✓ (T5), Deep-Links ✓ (T6), Suche + `<mark>` + `/`-Hotkey + No-Results-Hinweis ✓ (T3/T6 — der Einreichen-_Button_ ist PR 4, im Plan explizit als Kommentar markiert), Video-Fassade ✓ (T2), Datenschutz-Notiz ✓ (T8). §6-Anteil „Dialog-Primitive" ✓ (T4). §10-Anteile Lese-Suite ✓ (T8). Daumen/Feedback ist PR 4 (Spec-Schnitt §9) — bewusst nicht hier.
- Platzhalter: keine offenen; wo Repo-Details unbekannt sind (Schatten-Token, Migrations-Runner-Kommando, jsdom-Verfügbarkeit), steht die exakte Nachschlag-Anweisung mit Fundort.
- Typkonsistenz: `FaqEntryView.updatedAtIso` (string) konsistent in T1/T5/T6-Fixtures; `filterSections`-Signatur identisch in T6-Interface und Test; `forceOpen/defaultOpen` nur in T5/T6 und dort gleich benannt.
- Abhängigkeit: Plan setzt PR-1-Merge voraus (Global Constraints, Satz 1).
