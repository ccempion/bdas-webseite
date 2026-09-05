# FAQ-Suite v2 — PR 3: Board-Oberfläche `/federal/faq` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neuer, ausschließlich für den Bundesvorstand sichtbarer Bereich `/federal/faq` — Einträge anlegen/bearbeiten/veröffentlichen/löschen (im `Dialog`), Themen inline verwalten, Reihenfolge per Auf/Ab, YouTube-ID parsen mit Vorschau, verwandte Einträge verknüpfen, „Anzeigen bei"-Kontext-Zuordnung.

**Architecture:** Server Component (`page.tsx`) lädt alle Einträge (jeden Status), Themen und Feedback-Aggregate aus `@bdas/faq` und reicht sie an eine Client-Shell (`FaqAdminBoard`). Schreibende Server Actions (`actions.ts`) sind einfache async Funktionen mit typisierten Argumenten (kein `FormData`/`useActionState` — folgt dem Muster in `apps/web/app/(board)/_components/role-actions.ts` und `group-actions.ts`, nicht dem `FormData`-Muster der Events-Actions), jede öffnet mit `assertFederal()` und liefert `{ ok, error? }`. Bearbeitung läuft ausschließlich im `Dialog` (CLAUDE.md §7 / Spec §6). Die Kontext-Register-Datei (`apps/web/lib/faq/contexts.ts`) wird hier — vorgezogen aus PR 5 — mit Schlüssel+Label angelegt, weil das Eintragsformular sie für „Anzeigen bei" braucht; PR 5 erweitert dieselbe Datei um Routen-Muster und die Matching-Logik, ohne bestehende Felder zu brechen.

**Tech Stack:** Next.js 14 App Router (Server Actions als plain async functions), React Client Components, `@tiptap/react` + `@tiptap/starter-kit` (kein Image — eingeschränktes Set, Spec §3), Tailwind + Design-Tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md` (§3 Kontext-Register, §4 Autorisierung, §6, §9)

## Global Constraints

- Voraussetzung: **PR 1 und PR 2 sind gemerged** — `@bdas/faq` (Services: `listEntries`, `listEntriesByContext`, `createEntry`, `updateEntry`, `publishEntry`, `unpublishEntry`, `deleteEntry`, `reorderEntries`, `listTopics`, `createTopic`, `renameTopic`, `reorderTopics`, `deleteTopic`, `feedbackCounts`, Typen `FaqEntry`, `FaqTopic`, `EntryInput`, `FaqSectionKey`, `FaqSubgroupKey`, `FAQ_SECTIONS`, `FAQ_SUBGROUPS`) existiert; `apps/web/lib/faq/{assemble,order,visibility,youtube,plain-text}.ts` und die `Dialog`-Primitive (`core/design-system/src/components/Dialog.tsx`) existieren.
- Autorisierung: **jede Schreib-Action prüft `isFederalBoard`** (Spec §4) über `requireFederalBoard(me)` aus `@bdas/members` — kein `local_board`/`local_board_lead` darf hier schreiben, auch nicht für die eigene Gruppe (die FAQ kennt keine Gruppen-Scopes).
- Seitenzugriff: `/federal/faq` nutzt `requireFederalScope()` aus `apps/web/app/_dashboard/session.ts` — identisch mit jeder anderen federal-only Seite (`canSeeFederalScope` ist wortgleich `isFederalBoard`); ein Nicht-Bundesvorstand landet auf `/account` (die Spec spricht bildlich von „404", das ist die real existierende Umsetzung für den gesamten Federal-Bereich).
- Flag: `/federal/faq` ist zusätzlich hinter `faq_suite` — `if (!isFlagOn("faq_suite")) notFound();` (nicht die Basis-`faq`-Flag, die nur die alte statische Seite gated).
- CLAUDE.md §7: keine Inline-Hex/Radius/Schatten/Dauer — nur Token-Klassen. Fehlt ein Token: melden, nicht erfinden.
- Destruktive Aktionen (Eintrag/Thema löschen) nutzen `window.confirm(...)` — etabliertes Muster in `apps/web/app/admin/events/ManageButtons.tsx`, `apps/web/app/_blog/DeletePostButton.tsx`.
- Services sind auth-agnostisch (Modul-README) — `updatedBy`/Autoren-Felder sind **User-IDs** (`me.user.id`), nicht Member-IDs — Konvention aus `admin/events/actions.ts` (`createEvent(getDb(), input, me.user.id)`).
- Alle UI-Texte deutsch. Vor jedem Commit Prettier auf die geänderten Dateien.
- `/security-review` ist für diesen PR Pflicht (Spec §9: „PR 3–5 berühren Berechtigungen").

## File Structure

```
apps/web/lib/faq/
  assemble.ts             + Export SECTION_LABELS, VORSTAND_SUBGROUP_LABELS (additiv)
  contexts.ts             FAQ_CONTEXTS-Register (Schlüssel + Label)
  contexts.test.ts
  youtube.ts              + parseYoutubeInput(raw): string | null
  youtube.test.ts          + neue Fälle
apps/web/app/(board)/federal/faq/
  page.tsx                Federal-Gate, lädt Einträge/Themen/Feedback, rendert FaqAdminBoard
  actions.ts               Server Actions (Einträge + Themen), "use server"
  group-entries.ts          reine Gruppierungs-Logik
  group-entries.test.ts
  related-picker.ts          reine Toggle-Logik
  related-picker.test.ts
  FaqAdminBoard.tsx         Client-Shell: Liste je Bereich/Untergruppe, Auf/Ab, Badges, Dialog-Trigger
  FaqEntryDialog.tsx        Dialog-Formular: anlegen/bearbeiten
  FaqAnswerEditor.tsx       schlankes Tiptap (fett/kursiv/H2/H3/Liste/Link, kein Bild)
  RelatedEntriesPicker.tsx  Combobox + Chip-Liste
  TopicsPanel.tsx           Themen inline verwalten + "+Thema"-Dialog
apps/web/app/(board)/nav.ts         + FEDERAL_NAV-Eintrag "FAQ"
apps/web/app/(board)/nav.test.ts     + Assertion
e2e/faq.e2e.ts            erweitert um Board-Verwaltung + Zugriffskontrolle
```

---

### Task 1: Kontext-Register + Section-Labels-Export (TDD)

**Files:**

- Create: `apps/web/lib/faq/contexts.ts`, Test: `apps/web/lib/faq/contexts.test.ts`
- Modify: `apps/web/lib/faq/assemble.ts` (zwei neue Exporte, keine Verhaltensänderung)

**Interfaces:**

- Produces:

```ts
export type FaqContext = { readonly key: string; readonly label: string };
export const FAQ_CONTEXTS: readonly FaqContext[];
```

- Aus `assemble.ts` zusätzlich exportieren (Werte identisch zu `SECTION_META`, nur als eigene, kleinere Typen — kein Duplikat der Intros):

```ts
export const SECTION_LABELS: Record<FaqSectionKey, string> = {
  allgemein: SECTION_META.allgemein.title,
  bundesvorstand: SECTION_META.bundesvorstand.title,
  vorstand: SECTION_META.vorstand.title,
  mitglieder: SECTION_META.mitglieder.title,
};
export const VORSTAND_SUBGROUP_LABELS: Record<FaqSubgroupKey, string> = {
  local_board: "Vorstand",
  local_board_lead: "LEAD",
  event_organizer: "Event Organisator",
  page_editor: "Seiten Editor",
};
```

(Diese Werte 1:1 aus den `subgroups`-Einträgen in `SECTION_META.vorstand.subgroups` übernehmen — nicht neu erfinden.)

- [ ] **Step 1: Failing Test** (`contexts.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { FAQ_CONTEXTS } from "./contexts";

describe("FAQ_CONTEXTS", () => {
  it("has unique, non-empty keys and labels", () => {
    expect(FAQ_CONTEXTS.length).toBeGreaterThan(0);
    const keys = FAQ_CONTEXTS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of FAQ_CONTEXTS) {
      expect(c.key.trim()).toBe(c.key);
      expect(c.key.length).toBeGreaterThan(0);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `cd apps/web && pnpm vitest run lib/faq/contexts.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** —

```ts
/**
 * Stabile Schlüssel für "wo taucht dieser Eintrag als Kontext-Hilfe auf".
 * Ab PR 3 nur für das Board-Formular ("Anzeigen bei"); Routen-Matching und
 * das Hilfe-Panel kommen in PR 5 (Spec §7) — bis dahin liest niemand diese
 * Schlüssel zur Laufzeit, sie werden nur auf Einträge geschrieben.
 */
export type FaqContext = { readonly key: string; readonly label: string };

export const FAQ_CONTEXTS: readonly FaqContext[] = [
  { key: "events.erstellen", label: "Event erstellen" },
  { key: "dateien", label: "Dateien" },
  { key: "board.mitglieder", label: "Mitgliederverwaltung" },
  { key: "board.gruppen", label: "Gruppenverwaltung" },
  { key: "profil", label: "Profil" },
];
```

Dann die beiden Exporte in `assemble.ts` ergänzen (siehe Interfaces oben) — `SECTION_META` bleibt unverändert und privat, nur die zwei neuen `Record`-Konstanten werden zusätzlich exportiert.

- [ ] **Step 4: PASS sehen**, dann bestehende Tests absichern: Run: `pnpm vitest run lib/faq` → alle grün (insbesondere `assemble.test.ts` unverändert grün, da `SECTION_META` selbst nicht verändert wurde).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/contexts.ts apps/web/lib/faq/contexts.test.ts apps/web/lib/faq/assemble.ts
git commit -m "feat(faq): Kontext-Register und Bereichs-Labels für den Board-Editor"
```

---

### Task 2: YouTube-URL-Parser (TDD)

**Files:**

- Modify: `apps/web/lib/faq/youtube.ts`, `apps/web/lib/faq/youtube.test.ts`

**Interfaces:**

- Produces: `export function parseYoutubeInput(raw: string): string | null` — akzeptiert eine rohe 11-Zeichen-ID, eine `youtube.com/watch?v=<id>`-URL, eine `youtu.be/<id>`-URL oder eine `youtube.com/embed/<id>`-URL; alles andere (leerer String, ungültige URL, falsche ID-Länge) → `null`. Die ID-Form muss exakt zu `EntryInput.youtubeId`s Validierung in `modules/faq/src/services/entries.ts` passen (`/^[A-Za-z0-9_-]{11}$/`), sonst schlägt `saveEntryAction` später mit „Ungültige YouTube-Video-ID." fehl, obwohl die UI den Wert für gültig hielt.

- [ ] **Step 1: Failing Tests** (an `youtube.test.ts` anhängen):

```ts
import { parseYoutubeInput } from "./youtube";
// ...

describe("parseYoutubeInput", () => {
  it("accepts a raw 11-char id", () => {
    expect(parseYoutubeInput("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("extracts from watch, youtu.be and embed urls", () => {
    expect(parseYoutubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseYoutubeInput("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseYoutubeInput("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("rejects garbage and empty input", () => {
    expect(parseYoutubeInput("")).toBeNull();
    expect(parseYoutubeInput("nicht-11-zeichen")).toBeNull();
    expect(parseYoutubeInput("https://example.com/video")).toBeNull();
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run lib/faq/youtube.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** (an `youtube.ts` anhängen):

```ts
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYoutubeInput(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (YOUTUBE_ID_RE.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname === "youtu.be") {
    const id = url.pathname.slice(1);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }
  if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_RE.test(v)) return v;
    const embedMatch = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (embedMatch) return embedMatch[1]!;
  }
  return null;
}
```

- [ ] **Step 4: PASS** — Run: `pnpm vitest run lib/faq/youtube.test.ts` → PASS; `pnpm --filter web typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/faq/youtube.ts apps/web/lib/faq/youtube.test.ts
git commit -m "feat(faq): YouTube-URL-Parser für den Board-Editor"
```

---

### Task 3: Reine Board-Helfer — Gruppierung + Verwandte-Toggle (TDD)

**Files:**

- Create: `apps/web/app/(board)/federal/faq/group-entries.ts`, Test: `group-entries.test.ts`
- Create: `apps/web/app/(board)/federal/faq/related-picker.ts`, Test: `related-picker.test.ts`

**Interfaces:**

- Consumes: `FaqEntry, FaqSectionKey, FaqSubgroupKey` aus `@bdas/faq`.
- Produces:

```ts
export type ScopeGroup = {
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  entries: FaqEntry[];
};
/** Gruppiert nach (section, subgroup) in Reihenfolge des ersten Auftretens.
 *  `listEntries` liefert bereits Storage-Order (Modul-README), daher reicht
 *  ein einmaliger Durchlauf ohne erneute Sortierung. */
export function groupByScope(entries: readonly FaqEntry[]): ScopeGroup[];
```

```ts
/** Fügt `id` hinzu, wenn sie fehlt, entfernt sie sonst. */
export function toggleId(current: readonly string[], id: string): string[];
```

- [ ] **Step 1: Failing Tests**

`group-entries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupByScope } from "./group-entries";
import type { FaqEntry } from "@bdas/faq";

const entry = (over: Partial<FaqEntry>): FaqEntry => ({
  id: "e",
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "F?",
  body: { type: "doc" },
  youtubeId: null,
  status: "draft",
  position: 0,
  updatedAt: new Date("2026-09-01"),
  updatedBy: null,
  relatedIds: [],
  contexts: [],
  ...over,
});

describe("groupByScope", () => {
  it("groups by section+subgroup in first-seen order", () => {
    const out = groupByScope([
      entry({ id: "a", section: "vorstand", subgroup: "local_board_lead" }),
      entry({ id: "b", section: "mitglieder" }),
      entry({ id: "c", section: "vorstand", subgroup: "local_board_lead" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ section: "vorstand", subgroup: "local_board_lead" });
    expect(out[0]!.entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(out[1]!.entries.map((e) => e.id)).toEqual(["b"]);
  });

  it("treats null subgroup separately from a named one in the same section", () => {
    const out = groupByScope([
      entry({ id: "a", section: "vorstand", subgroup: null }),
      entry({ id: "b", section: "vorstand", subgroup: "page_editor" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("empty input yields no groups", () => {
    expect(groupByScope([])).toEqual([]);
  });
});
```

`related-picker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toggleId } from "./related-picker";

describe("toggleId", () => {
  it("adds an absent id and removes a present one", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a"], "a")).toEqual([]);
    expect(toggleId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: FAIL sehen** — Run: `pnpm vitest run app/\(board\)/federal/faq/group-entries.test.ts app/\(board\)/federal/faq/related-picker.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

```ts
// group-entries.ts
import type { FaqEntry, FaqSectionKey, FaqSubgroupKey } from "@bdas/faq";

export type ScopeGroup = {
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  entries: FaqEntry[];
};

export function groupByScope(entries: readonly FaqEntry[]): ScopeGroup[] {
  const groups = new Map<string, ScopeGroup>();
  for (const entry of entries) {
    const key = `${entry.section}:${entry.subgroup ?? ""}`;
    let group = groups.get(key);
    if (!group) {
      group = { section: entry.section, subgroup: entry.subgroup, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}
```

```ts
// related-picker.ts
export function toggleId(current: readonly string[], id: string): string[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}
```

- [ ] **Step 4: PASS + Typecheck** — Run: `pnpm vitest run app/\(board\)/federal/faq && pnpm --filter web typecheck` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/group-entries.ts apps/web/app/\(board\)/federal/faq/group-entries.test.ts apps/web/app/\(board\)/federal/faq/related-picker.ts apps/web/app/\(board\)/federal/faq/related-picker.test.ts
git commit -m "feat(faq): reine Gruppierungs- und Verknüpfungs-Helfer für den Board-Editor"
```

---

### Task 4: Server Actions (Einträge + Themen)

**Files:**

- Create: `apps/web/app/(board)/federal/faq/actions.ts`

**Interfaces:**

- Consumes: `getDb` aus `@bdas/db`; `getCurrentMember, requireFederalBoard` aus `@bdas/members`; `readSessionCookie` aus `../../../lib/auth-cookie`; `createEntry, updateEntry, publishEntry, unpublishEntry, deleteEntry, reorderEntries, createTopic, renameTopic, reorderTopics, deleteTopic` aus `@bdas/faq`; `FaqSectionKey, FaqSubgroupKey` aus `@bdas/faq`.
- Produces:

```ts
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function saveEntryAction(input: {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: unknown;
  youtubeId: string | null;
  relatedIds: string[];
  contexts: string[];
  submissionId?: string;
  publish: boolean;
}): Promise<ActionResult>;

export async function publishEntryAction(id: string): Promise<ActionResult>;
export async function unpublishEntryAction(id: string): Promise<ActionResult>;
export async function deleteEntryAction(id: string): Promise<ActionResult>;
export async function reorderEntriesAction(
  section: FaqSectionKey,
  subgroup: FaqSubgroupKey | null,
  orderedIds: string[],
): Promise<ActionResult>;
export async function createTopicAction(name: string): Promise<ActionResult>;
export async function renameTopicAction(id: string, name: string): Promise<ActionResult>;
export async function deleteTopicAction(id: string): Promise<ActionResult>;
export async function reorderTopicsAction(orderedIds: string[]): Promise<ActionResult>;
```

- [ ] **Step 1: Implementieren**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import {
  createEntry,
  createTopic,
  deleteEntry,
  deleteTopic,
  publishEntry,
  renameTopic,
  reorderEntries,
  reorderTopics,
  unpublishEntry,
  updateEntry,
  type FaqSectionKey,
  type FaqSubgroupKey,
} from "@bdas/faq";
import { getCurrentMember, requireFederalBoard, type CurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../../lib/auth-cookie";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

/** Every write here is federal-board only (Spec §4) — no group scope exists
 *  for the FAQ, so there is nothing weaker to fall back to. */
async function assertFederal(): Promise<CurrentMember> {
  const me = await getCurrentMember(getDb(), readSessionCookie());
  requireFederalBoard(me);
  return me;
}

function revalidateFaq(): void {
  revalidatePath("/federal/faq");
  revalidatePath("/faq");
}

function errorResult(err: unknown): ActionResult {
  if (isAppError(err)) return { ok: false, error: err.message };
  throw err;
}

export async function saveEntryAction(input: {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: unknown;
  youtubeId: string | null;
  relatedIds: string[];
  contexts: string[];
  submissionId?: string;
  publish: boolean;
}): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    const db = getDb();
    const base = {
      section: input.section,
      subgroup: input.subgroup,
      topicId: input.topicId,
      question: input.question,
      body: input.body,
      youtubeId: input.youtubeId,
      relatedIds: input.relatedIds,
      contexts: input.contexts,
    };
    const saved = input.id
      ? await updateEntry(db, { ...base, id: input.id, updatedBy: me.user.id })
      : await createEntry(db, {
          ...base,
          updatedBy: me.user.id,
          ...(input.submissionId ? { submissionId: input.submissionId } : {}),
        });
    if (input.publish && saved.status !== "published") {
      await publishEntry(db, { id: saved.id, updatedBy: me.user.id });
    }
    revalidateFaq();
    return { ok: true, id: saved.id };
  } catch (err) {
    return errorResult(err);
  }
}

export async function publishEntryAction(id: string): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    await publishEntry(getDb(), { id, updatedBy: me.user.id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function unpublishEntryAction(id: string): Promise<ActionResult> {
  try {
    const me = await assertFederal();
    await unpublishEntry(getDb(), { id, updatedBy: me.user.id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function deleteEntryAction(id: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await deleteEntry(getDb(), { id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function reorderEntriesAction(
  section: FaqSectionKey,
  subgroup: FaqSubgroupKey | null,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    await assertFederal();
    await reorderEntries(getDb(), { section, subgroup, orderedIds });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function createTopicAction(name: string): Promise<ActionResult> {
  try {
    await assertFederal();
    const topic = await createTopic(getDb(), { name });
    revalidateFaq();
    return { ok: true, id: topic.id };
  } catch (err) {
    return errorResult(err);
  }
}

export async function renameTopicAction(id: string, name: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await renameTopic(getDb(), { id, name });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function deleteTopicAction(id: string): Promise<ActionResult> {
  try {
    await assertFederal();
    await deleteTopic(getDb(), { id });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}

export async function reorderTopicsAction(orderedIds: string[]): Promise<ActionResult> {
  try {
    await assertFederal();
    await reorderTopics(getDb(), { orderedIds });
    revalidateFaq();
    return { ok: true };
  } catch (err) {
    return errorResult(err);
  }
}
```

(`isAppError`/`ValidationError`/`NotFoundError`/`ForbiddenError` kommen aus `@bdas/errors`, wie im Modul-README beschrieben; `requireFederalBoard` wirft `ForbiddenError`, die ebenfalls ein `AppError` ist, also von `errorResult` sauber in `{ok:false, error}` übersetzt wird, statt als 500 zu crashen.)

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün. (Keine Unit-Tests für Server Actions — Autorisierung und Statusübergänge sind bereits in `modules/faq`s Integrationstests abgedeckt; das Zusammenspiel testet Task 10 per E2E.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/actions.ts
git commit -m "feat(faq): Server Actions für Board-Verwaltung von Einträgen und Themen"
```

---

### Task 5: Antwort-Editor + Verwandte-Einträge-Picker

**Files:**

- Create: `apps/web/app/(board)/federal/faq/FaqAnswerEditor.tsx`
- Create: `apps/web/app/(board)/federal/faq/RelatedEntriesPicker.tsx`

**Interfaces:**

- Consumes: `@tiptap/react`, `@tiptap/starter-kit`; `TiptapDoc` aus `@bdas/faq`; `Combobox, type ComboboxOption` aus `@bdas/design-system`; `toggleId` aus `./related-picker`.
- Produces:

```tsx
export function FaqAnswerEditor(props: {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
}): ReactNode;

export function RelatedEntriesPicker(props: {
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  selfId: string | null; // bei "edit": eigene id ausschließen
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
}): ReactNode;
```

- `FaqAnswerEditor`: kontrollierte Variante von `apps/web/app/admin/events/_editor/RichTextEditor.tsx` **ohne** `Image`-Extension, ohne Upload, ohne `eventId`/Hidden-Input — Board-Dialog hält den Zustand selbst und übergibt ihn per `onChange`, statt ihn in ein `<form>` zu schreiben (hier gibt es kein natives Formular-Submit, die Actions aus Task 4 nehmen Plain-Objects). Toolbar exakt: Fett, Kursiv, H2, H3, Liste, Link (kein Bild-Button).
- `RelatedEntriesPicker`: `Combobox` zum Hinzufügen (Optionen = `allEntries` minus `selfId` minus bereits gewählte, `value` bleibt nach Auswahl leer — kein persistenter "gewählter" Zustand im Combobox selbst), darunter Chip-Liste der gewählten Fragen mit „×"-Entfernen-Button, der `toggleId` aufruft.

- [ ] **Step 1: Beide Dateien schreiben.**

```tsx
// FaqAnswerEditor.tsx
"use client";

import { EditorContent, useEditor, type Content } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

import type { TiptapDoc } from "@bdas/faq";

const BTN =
  "rounded-bdas-sm px-2 py-1 text-sm text-bdas-ink-body hover:bg-bdas-overlay-hover " +
  "transition-colors duration-bdas-quick ease-bdas data-[active=true]:bg-bdas-overlay-soft";

/** Eingeschränktes Set (Spec §3): fett/kursiv/Zwischenüberschriften/Listen/
 *  Links — kein Bild, kein Upload, anders als das Events-Pendant. */
export function FaqAnswerEditor({
  value,
  onChange,
}: {
  value: TiptapDoc;
  onChange: (doc: TiptapDoc) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ underline: false, link: { openOnClick: false } })],
    content: value as Content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getJSON() as TiptapDoc),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-[8rem] rounded-bdas border border-bdas-soft bg-bdas-surface " +
          "px-3 py-2.5 focus:border-bdas-red focus:outline-none",
      },
    },
  });

  // Reopening the dialog for a different entry must reset the editor's own
  // internal state — Tiptap does not re-derive content from a changed `content`
  // prop after first mount.
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value as Content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on identity change of the doc, not every keystroke
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 border-b border-bdas-soft pb-2">
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Fett
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Kursiv
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
        <button
          type="button"
          className={BTN}
          data-active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Liste
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => {
            const url = window.prompt("Link-URL (https://…)") ?? "";
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

```tsx
// RelatedEntriesPicker.tsx
"use client";

import { Combobox } from "@bdas/design-system";

import { toggleId } from "./related-picker";

export function RelatedEntriesPicker({
  allEntries,
  selfId,
  selectedIds,
  onChange,
}: {
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  selfId: string | null;
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);
  const options = allEntries
    .filter((e) => e.id !== selfId && !selected.has(e.id))
    .map((e) => ({ value: e.id, label: e.question }));
  const byId = new Map(allEntries.map((e) => [e.id, e.question]));

  return (
    <div className="flex flex-col gap-2">
      <Combobox
        label="Verwandte Frage hinzufügen"
        placeholder="Frage suchen…"
        options={options}
        value=""
        onChange={(id) => {
          if (id) onChange(toggleId(selectedIds, id));
        }}
      />
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1.5 rounded-bdas-pill border border-bdas-soft px-2 py-0.5 text-sm text-bdas-ink-body"
            >
              {byId.get(id) ?? id}
              <button
                type="button"
                aria-label={`„${byId.get(id) ?? id}" entfernen`}
                onClick={() => onChange(toggleId(selectedIds, id))}
                className="text-bdas-ink-muted hover:text-bdas-red"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün. (Kein eigener Unit-Test: `toggleId` ist in Task 3 getestet; das Zusammenspiel prüft Task 10 per E2E.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/FaqAnswerEditor.tsx apps/web/app/\(board\)/federal/faq/RelatedEntriesPicker.tsx
git commit -m "feat(faq): Antwort-Editor und Verwandte-Einträge-Picker für den Board-Dialog"
```

---

### Task 6: `TopicsPanel` — Themen inline verwalten

**Files:**

- Create: `apps/web/app/(board)/federal/faq/TopicsPanel.tsx`

**Interfaces:**

- Consumes: `FaqTopic` aus `@bdas/faq`; `createTopicAction, renameTopicAction, deleteTopicAction, reorderTopicsAction` aus `./actions`; `Dialog, Input` aus `@bdas/design-system`.
- Produces: `<TopicsPanel topics={FaqTopic[]} />` — Client Component.
- Verhalten: Liste der Themen (Name, Auf/Ab-Buttons die `reorderTopicsAction` mit der neuen Reihenfolge aufrufen, Umbenennen per Klick → Inline-`Input` + „Speichern"/„Abbrechen", Löschen per Button + `window.confirm("Thema löschen? Zugeordnete Einträge verlieren nur das Thema.")` → `deleteTopicAction`). „+ Thema"-Button öffnet einen `Dialog` (`title="Thema anlegen"`) mit einem `Input` + „Anlegen"-Button, der `createTopicAction` aufruft und den Dialog bei Erfolg schließt.

- [ ] **Step 1: Datei schreiben.**

```tsx
"use client";

import { useState, useTransition } from "react";

import { Dialog, Input } from "@bdas/design-system";
import type { FaqTopic } from "@bdas/faq";

import {
  createTopicAction,
  deleteTopicAction,
  renameTopicAction,
  reorderTopicsAction,
} from "./actions";

export function TopicsPanel({ topics }: { topics: readonly FaqTopic[] }) {
  const [pending, start] = useTransition();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= topics.length) return;
    const orderedIds = topics.map((t) => t.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target]!, orderedIds[index]!];
    start(async () => {
      const res = await reorderTopicsAction(orderedIds);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-bdas-ink">Themen</h3>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs font-semibold text-bdas-ink-body hover:bg-bdas-overlay-hover"
        >
          + Thema
        </button>
      </div>
      {error && <p className="text-sm text-bdas-red">{error}</p>}
      <ul className="flex flex-col gap-1">
        {topics.map((t, i) => (
          <li key={t.id} className="flex items-center gap-2">
            {renamingId === t.id ? (
              <>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await renameTopicAction(t.id, renameValue);
                      if (res.ok) setRenamingId(null);
                      else setError(res.error);
                    })
                  }
                  className="text-sm font-semibold text-bdas-red"
                >
                  Speichern
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="text-sm text-bdas-ink-muted"
                >
                  Abbrechen
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-bdas-ink-body">{t.name}</span>
                <button
                  type="button"
                  disabled={i === 0 || pending}
                  onClick={() => move(i, -1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`${t.name} nach oben`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === topics.length - 1 || pending}
                  onClick={() => move(i, 1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`${t.name} nach unten`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(t.id);
                    setRenameValue(t.name);
                  }}
                  className="text-xs text-bdas-ink-muted hover:text-bdas-ink"
                >
                  Umbenennen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `„${t.name}" löschen? Zugeordnete Einträge verlieren nur das Thema.`,
                      )
                    )
                      return;
                    start(async () => {
                      const res = await deleteTopicAction(t.id);
                      if (!res.ok) setError(res.error);
                    });
                  }}
                  className="text-xs text-bdas-ink-muted hover:text-bdas-red"
                >
                  Löschen
                </button>
              </>
            )}
          </li>
        ))}
        {topics.length === 0 && <li className="text-sm text-bdas-ink-muted">Noch keine Themen.</li>}
      </ul>
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Thema anlegen">
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Themenname"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || newName.trim() === ""}
              onClick={() =>
                start(async () => {
                  const res = await createTopicAction(newName);
                  if (res.ok) {
                    setNewName("");
                    setCreateOpen(false);
                  } else setError(res.error);
                })
              }
              className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
            >
              Anlegen
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün. (`Input`s genaue Props vorher in `core/design-system/src/components/Input.tsx` gegenchecken — falls `className` dort nicht durchgereicht wird, das Wrapper-`<div>` stattdessen breiter machen statt die Komponente zu erweitern.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/TopicsPanel.tsx
git commit -m "feat(faq): Themen inline verwalten mit Anlegen-Dialog"
```

---

### Task 7: `FaqEntryDialog` — Eintrag anlegen/bearbeiten

**Files:**

- Create: `apps/web/app/(board)/federal/faq/FaqEntryDialog.tsx`

**Interfaces:**

- Consumes: `Dialog, Input, Alert, FilterChip` aus `@bdas/design-system`; `FAQ_SECTIONS, FAQ_SUBGROUPS, type FaqEntry, type FaqSectionKey, type FaqSubgroupKey, type FaqTopic, type TiptapDoc` aus `@bdas/faq`; `SECTION_LABELS, VORSTAND_SUBGROUP_LABELS` aus `../../../lib/faq/assemble`; `FAQ_CONTEXTS` aus `../../../lib/faq/contexts`; `parseYoutubeInput, youtubeThumbnailUrl` aus `../../../lib/faq/youtube`; `FaqAnswerEditor`; `RelatedEntriesPicker`; `saveEntryAction` aus `./actions`.
- Produces:

```tsx
export type FaqEntryDialogInitial = {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: TiptapDoc;
  youtubeId: string | null;
  relatedIds: readonly string[];
  contexts: readonly string[];
  submissionId?: string;
};

export function FaqEntryDialog(props: {
  open: boolean;
  onClose: () => void;
  initial: FaqEntryDialogInitial;
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
  currentStatus: "draft" | "published" | null; // null = neuer Eintrag
}): ReactNode;
```

- Verhalten: hält `section/subgroup/topicId/question/body/youtubeUrl/relatedIds/contexts` als lokalen State, initialisiert aus `initial` bei jedem Öffnen (`key={initial.id ?? "new"}` am `Dialog`-Kind erzwingt Remount statt `useEffect`-Sync — gleiche Begründung wie `FaqEntryCard`s `key`-Remount in PR 2). YouTube-Feld: Text-Input für URL/ID, `parseYoutubeInput` bei jeder Änderung; gültige ID zeigt eine `<img src={youtubeThumbnailUrl(id)}>`-Vorschau (**anders als die Lesefassade**: eine explizite Board-Eingabe rechtfertigt den Google-Request, siehe PR 2s Kommentar in `youtube.ts`s Nutzung). Sektion-Select: `<select>` über `FAQ_SECTIONS` mit `SECTION_LABELS`; wenn `section !== "vorstand"` wird `subgroup` erzwungen auf `null` und das Untergruppen-Select ausgeblendet; sonst `<select>` über `FAQ_SUBGROUPS` (+ „— keine —" Option) mit `VORSTAND_SUBGROUP_LABELS`. Themen-Select: `<select>` über `topics` (+ „— kein Thema —"). „Anzeigen bei": `FilterChip` pro `FAQ_CONTEXTS`-Eintrag, `active = contexts.includes(c.key)`, Klick togglet über die Menge. Zwei Submit-Buttons: „Speichern" (`publish:false`) immer sichtbar; „Veröffentlichen" nur wenn `currentStatus !== "published"` (ein bereits veröffentlichter Eintrag hat keinen Grund, sich selbst erneut zu veröffentlichen — Unveröffentlichen ist eine Zeilen-Aktion in `FaqAdminBoard`, nicht Teil dieses Formulars). Bei Erfolg: `onClose()`. Fehler: `<Alert variant="error">`.

- [ ] **Step 1: Datei schreiben.**

```tsx
"use client";

import { useState, useTransition } from "react";

import { Alert, Dialog, FilterChip, Input } from "@bdas/design-system";
import {
  FAQ_SECTIONS,
  FAQ_SUBGROUPS,
  type FaqSectionKey,
  type FaqSubgroupKey,
  type FaqTopic,
  type TiptapDoc,
} from "@bdas/faq";

import { SECTION_LABELS, VORSTAND_SUBGROUP_LABELS } from "../../../lib/faq/assemble";
import { FAQ_CONTEXTS } from "../../../lib/faq/contexts";
import { parseYoutubeInput, youtubeThumbnailUrl } from "../../../lib/faq/youtube";
import { saveEntryAction } from "./actions";
import { FaqAnswerEditor } from "./FaqAnswerEditor";
import { RelatedEntriesPicker } from "./RelatedEntriesPicker";

export type FaqEntryDialogInitial = {
  id?: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: TiptapDoc;
  youtubeId: string | null;
  relatedIds: readonly string[];
  contexts: readonly string[];
  submissionId?: string;
};

function EntryForm({
  initial,
  allEntries,
  topics,
  currentStatus,
  onClose,
}: {
  initial: FaqEntryDialogInitial;
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
  currentStatus: "draft" | "published" | null;
  onClose: () => void;
}) {
  const [section, setSection] = useState(initial.section);
  const [subgroup, setSubgroup] = useState(initial.subgroup);
  const [topicId, setTopicId] = useState(initial.topicId);
  const [question, setQuestion] = useState(initial.question);
  const [body, setBody] = useState<TiptapDoc>(initial.body);
  const [youtubeInput, setYoutubeInput] = useState(initial.youtubeId ?? "");
  const [relatedIds, setRelatedIds] = useState<string[]>([...initial.relatedIds]);
  const [contexts, setContexts] = useState<string[]>([...initial.contexts]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const youtubeId = parseYoutubeInput(youtubeInput);

  function submit(publish: boolean) {
    start(async () => {
      setError(null);
      const res = await saveEntryAction({
        id: initial.id,
        section,
        subgroup: section === "vorstand" ? subgroup : null,
        topicId,
        question,
        body,
        youtubeId,
        relatedIds,
        contexts,
        submissionId: initial.submissionId,
        publish,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Frage"
        aria-label="Frage"
      />
      <div className="flex gap-3">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as FaqSectionKey)}
          className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
        >
          {FAQ_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {SECTION_LABELS[s]}
            </option>
          ))}
        </select>
        {section === "vorstand" && (
          <select
            value={subgroup ?? ""}
            onChange={(e) => setSubgroup((e.target.value || null) as FaqSubgroupKey | null)}
            className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
          >
            <option value="">— keine —</option>
            {FAQ_SUBGROUPS.map((s) => (
              <option key={s} value={s}>
                {VORSTAND_SUBGROUP_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <select
          value={topicId ?? ""}
          onChange={(e) => setTopicId(e.target.value || null)}
          className="rounded-bdas border border-bdas-soft px-3 py-2 text-bdas-ink-body"
        >
          <option value="">— kein Thema —</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <FaqAnswerEditor value={body} onChange={setBody} />
      <div className="flex flex-col gap-2">
        <Input
          value={youtubeInput}
          onChange={(e) => setYoutubeInput(e.target.value)}
          placeholder="YouTube-URL oder Video-ID (optional)"
        />
        {youtubeInput.trim() !== "" && !youtubeId && (
          <p className="text-sm text-bdas-red">Keine gültige YouTube-URL/ID erkannt.</p>
        )}
        {youtubeId && (
          // eslint-disable-next-line @next/next/no-img-element -- explizite Board-Eingabe, keine Fassade nötig (siehe Interfaces oben)
          <img
            src={youtubeThumbnailUrl(youtubeId)}
            alt="Video-Vorschau"
            className="w-40 rounded-bdas"
          />
        )}
      </div>
      <RelatedEntriesPicker
        allEntries={allEntries}
        selfId={initial.id ?? null}
        selectedIds={relatedIds}
        onChange={setRelatedIds}
      />
      <div className="flex flex-wrap gap-2">
        {FAQ_CONTEXTS.map((c) => (
          <FilterChip
            key={c.key}
            active={contexts.includes(c.key)}
            onClick={() =>
              setContexts((cur) =>
                cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key],
              )
            }
          >
            {c.label}
          </FilterChip>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || question.trim() === ""}
          onClick={() => submit(false)}
          className="rounded-bdas-sm border border-bdas-soft px-3 py-1.5 text-sm font-semibold text-bdas-ink-body disabled:opacity-40"
        >
          Speichern
        </button>
        {currentStatus !== "published" && (
          <button
            type="button"
            disabled={pending || question.trim() === ""}
            onClick={() => submit(true)}
            className="rounded-bdas-sm bg-bdas-red px-3 py-1.5 text-sm font-semibold text-bdas-surface disabled:opacity-40"
          >
            Veröffentlichen
          </button>
        )}
      </div>
    </div>
  );
}

export function FaqEntryDialog({
  open,
  onClose,
  initial,
  allEntries,
  topics,
  currentStatus,
}: {
  open: boolean;
  onClose: () => void;
  initial: FaqEntryDialogInitial;
  allEntries: ReadonlyArray<{ id: string; question: string }>;
  topics: readonly FaqTopic[];
  currentStatus: "draft" | "published" | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial.id ? "Eintrag bearbeiten" : "Eintrag anlegen"}
      wide
    >
      {open && (
        <EntryForm
          key={initial.id ?? "new"}
          initial={initial}
          allEntries={allEntries}
          topics={topics}
          currentStatus={currentStatus}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/FaqEntryDialog.tsx
git commit -m "feat(faq): Eintrags-Dialog — Formular, YouTube-Vorschau, Anzeigen-bei"
```

---

### Task 8: `FaqAdminBoard` — Liste, Auf/Ab, Badges

**Files:**

- Create: `apps/web/app/(board)/federal/faq/FaqAdminBoard.tsx`

**Interfaces:**

- Consumes: `FaqEntry, FaqTopic, type FeedbackCounts` aus `@bdas/faq`; `SECTION_LABELS, VORSTAND_SUBGROUP_LABELS` aus `../../../lib/faq/assemble`; `groupByScope` aus `./group-entries`; `publishEntryAction, unpublishEntryAction, deleteEntryAction, reorderEntriesAction` aus `./actions`; `FaqEntryDialog`; `TopicsPanel`.
- Produces:

```tsx
export function FaqAdminBoard(props: {
  entries: readonly FaqEntry[]; // jeder Status
  topics: readonly FaqTopic[];
  feedbackByEntry: Record<string, FeedbackCounts>; // vorab serialisiert (kein Map über die Server/Client-Grenze)
}): ReactNode;
```

- Layout: `TopicsPanel` oben, „+ Eintrag"-Button daneben (öffnet `FaqEntryDialog` im `mode: create`, `initial` mit leeren Feldern: `section: "mitglieder", subgroup: null, topicId: null, question: "", body: {type:"doc",content:[]}, youtubeId: null, relatedIds: [], contexts: []`). Darunter je `ScopeGroup` aus `groupByScope(entries)` eine Karte mit Titel (`SECTION_LABELS[section]` + optional ` · ${VORSTAND_SUBGROUP_LABELS[subgroup]}`), darin jede Zeile: Status-Pill („Entwurf" grau / „Veröffentlicht" — statisches Pill-Muster wie `FaqEntryCard`s Themen-Chip, kein `Badge` aus dem Design-System, da der auch dort nur Zahlen rendert), Frage, Feedback-Zähler (`👍{up} 👎{down}` aus `feedbackByEntry[entry.id] ?? {up:0,down:0}`), Auf/Ab-Buttons (rufen `reorderEntriesAction` mit der lokal geswappten `orderedIds`-Liste der Gruppe auf), „Bearbeiten" (öffnet Dialog im Edit-Modus mit den Werten der Zeile), „Veröffentlichen"/„Zurückziehen" (je nach `status`), „Löschen" (`window.confirm` → `deleteEntryAction`).

- [ ] **Step 1: Datei schreiben.**

```tsx
"use client";

import { useState, useTransition } from "react";

import type { FaqEntry, FaqTopic, FeedbackCounts } from "@bdas/faq";

import { SECTION_LABELS, VORSTAND_SUBGROUP_LABELS } from "../../../lib/faq/assemble";
import {
  deleteEntryAction,
  publishEntryAction,
  reorderEntriesAction,
  unpublishEntryAction,
} from "./actions";
import { FaqEntryDialog, type FaqEntryDialogInitial } from "./FaqEntryDialog";
import { groupByScope } from "./group-entries";
import { TopicsPanel } from "./TopicsPanel";

const EMPTY_ENTRY: FaqEntryDialogInitial = {
  section: "mitglieder",
  subgroup: null,
  topicId: null,
  question: "",
  body: { type: "doc", content: [] },
  youtubeId: null,
  relatedIds: [],
  contexts: [],
};

function toInitial(entry: FaqEntry): FaqEntryDialogInitial {
  return {
    id: entry.id,
    section: entry.section,
    subgroup: entry.subgroup,
    topicId: entry.topicId,
    question: entry.question,
    body: entry.body,
    youtubeId: entry.youtubeId,
    relatedIds: entry.relatedIds,
    contexts: entry.contexts,
  };
}

export function FaqAdminBoard({
  entries,
  topics,
  feedbackByEntry,
}: {
  entries: readonly FaqEntry[];
  topics: readonly FaqTopic[];
  feedbackByEntry: Record<string, FeedbackCounts>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    initial: FaqEntryDialogInitial;
    currentStatus: "draft" | "published" | null;
  } | null>(null);

  const allEntries = entries.map((e) => ({ id: e.id, question: e.question }));
  const groups = groupByScope(entries);

  function move(group: ReturnType<typeof groupByScope>[number], index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= group.entries.length) return;
    const orderedIds = group.entries.map((e) => e.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target]!, orderedIds[index]!];
    start(async () => {
      const res = await reorderEntriesAction(group.section, group.subgroup, orderedIds);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <TopicsPanel topics={topics} />
        <button
          type="button"
          onClick={() => setDialog({ initial: EMPTY_ENTRY, currentStatus: null })}
          className="self-start rounded-bdas-sm bg-bdas-red px-3 py-2 text-sm font-semibold text-bdas-surface"
        >
          + Eintrag
        </button>
      </div>
      {error && <p className="text-sm text-bdas-red">{error}</p>}
      {groups.map((group) => (
        <div
          key={`${group.section}:${group.subgroup ?? ""}`}
          className="overflow-hidden rounded-bdas border border-bdas-soft bg-bdas-surface shadow-bdas-card"
        >
          <h3 className="border-b border-bdas-soft px-4 py-2 text-sm font-bold text-bdas-ink">
            {SECTION_LABELS[group.section]}
            {group.subgroup ? ` · ${VORSTAND_SUBGROUP_LABELS[group.subgroup]}` : ""}
          </h3>
          {group.entries.map((entry, i) => {
            const counts = feedbackByEntry[entry.id] ?? { up: 0, down: 0 };
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 border-b border-bdas-soft px-4 py-2 last:border-b-0"
              >
                <span
                  className={
                    entry.status === "published"
                      ? "rounded-bdas-pill bg-bdas-surface-hover px-2 py-0.5 text-xs font-semibold text-bdas-ink-muted"
                      : "rounded-bdas-pill border border-bdas-red px-2 py-0.5 text-xs font-semibold text-bdas-red"
                  }
                >
                  {entry.status === "published" ? "Veröffentlicht" : "Entwurf"}
                </span>
                <span className="flex-1 text-sm text-bdas-ink">{entry.question}</span>
                <span className="text-xs text-bdas-ink-muted">
                  👍 {counts.up} 👎 {counts.down}
                </span>
                <button
                  type="button"
                  disabled={i === 0 || pending}
                  onClick={() => move(group, i, -1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`„${entry.question}" nach oben`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === group.entries.length - 1 || pending}
                  onClick={() => move(group, i, 1)}
                  className="text-bdas-ink-muted disabled:opacity-30"
                  aria-label={`„${entry.question}" nach unten`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDialog({ initial: toInitial(entry), currentStatus: entry.status })
                  }
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover"
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res =
                        entry.status === "published"
                          ? await unpublishEntryAction(entry.id)
                          : await publishEntryAction(entry.id);
                      if (!res.ok) setError(res.error);
                    })
                  }
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-overlay-hover"
                >
                  {entry.status === "published" ? "Zurückziehen" : "Veröffentlichen"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`„${entry.question}" endgültig löschen?`)) return;
                    start(async () => {
                      const res = await deleteEntryAction(entry.id);
                      if (!res.ok) setError(res.error);
                    });
                  }}
                  className="rounded-bdas-sm border border-bdas-soft px-2 py-1 text-xs text-bdas-ink-body hover:bg-bdas-red hover:text-bdas-surface"
                >
                  Löschen
                </button>
              </div>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && (
        <p className="text-sm text-bdas-ink-muted">Noch keine Einträge — leg den ersten an.</p>
      )}
      {dialog && (
        <FaqEntryDialog
          open
          onClose={() => setDialog(null)}
          initial={dialog.initial}
          allEntries={allEntries}
          topics={topics}
          currentStatus={dialog.currentStatus}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `pnpm --filter web typecheck` → grün.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/FaqAdminBoard.tsx
git commit -m "feat(faq): Board-Liste mit Auf/Ab, Status-Pills und Feedback-Zähler"
```

---

### Task 9: `page.tsx` + `FEDERAL_NAV`

**Files:**

- Create: `apps/web/app/(board)/federal/faq/page.tsx`
- Modify: `apps/web/app/(board)/nav.ts`, `apps/web/app/(board)/nav.test.ts`

**Interfaces:**

- Consumes: `getDb` aus `@bdas/db`; `isFlagOn` aus `@bdas/feature-flags`; `listEntries, listTopics, feedbackCounts` aus `@bdas/faq`; `requireFederalScope` aus `../../../_dashboard/session`; `FaqAdminBoard`.

- [ ] **Step 1: `nav.ts` ergänzen** — nach `"/federal/roles"`:

```ts
  { href: "/federal/roles", label: "Rollen" },
  { href: "/federal/faq", label: "FAQ" },
  { href: "/federal/files", label: "Dateien" },
```

(zwischen Rollen und Dateien, damit der Board-Bereich vor der Datei-Verwaltung landet — beliebig, aber konsistent mit der Reihenfolge im Sidebar-Review.)

- [ ] **Step 2: `nav.test.ts` Assertion ergänzen** — neben der bestehenden `/federal/pool`-Assertion:

```ts
expect(FEDERAL_NAV.map((i) => i.href)).toContain("/federal/pool");
expect(FEDERAL_NAV.map((i) => i.href)).toContain("/federal/faq");
```

- [ ] **Step 3: `page.tsx` schreiben.**

```tsx
import { notFound } from "next/navigation";

import { getDb } from "@bdas/db";
import { feedbackCounts, listEntries, listTopics } from "@bdas/faq";
import { isFlagOn } from "@bdas/feature-flags";

import { requireFederalScope } from "../../../_dashboard/session";
import { FaqAdminBoard } from "./FaqAdminBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "FAQ" };

export default async function FederalFaqPage() {
  if (!isFlagOn("faq_suite")) notFound();
  await requireFederalScope();

  const db = getDb();
  const [entries, topics] = await Promise.all([listEntries(db), listTopics(db)]);
  const counts = await feedbackCounts(
    db,
    entries.map((e) => e.id),
  );
  const feedbackByEntry = Object.fromEntries(counts);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-bdas-ink">FAQ</h1>
      <FaqAdminBoard entries={entries} topics={topics} feedbackByEntry={feedbackByEntry} />
    </section>
  );
}
```

- [ ] **Step 4: Typecheck + Unit-Tests** — Run: `pnpm --filter web typecheck && pnpm vitest run "app/(board)/nav.test.ts"` → grün.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(board\)/federal/faq/page.tsx apps/web/app/\(board\)/nav.ts apps/web/app/\(board\)/nav.test.ts
git commit -m "feat(faq): /federal/faq — Seite, Nav-Eintrag, Federal-Gate"
```

---

### Task 10: E2E + Security-Review-Hinweis + PR

**Files:**

- Modify: `e2e/faq.e2e.ts`

**Interfaces:** keine neuen — nutzt bestehende Test-Helfer `registerVerifyLogin`, `deleteUserByEmail` aus `./helpers/flows`/`./helpers/db`, und muss einen Bundesvorstand-Account provisionieren; dafür nach dem existierenden Muster in anderen Board-E2E-Suiten suchen (z. B. `e2e/roles.e2e.ts` oder `e2e/events.e2e.ts` — dort nachschlagen, wie ein `federal_board`-Grant für einen frisch registrierten Test-User gesetzt wird, z. B. ein `grantFederalBoard(email)`-Helfer in `e2e/helpers/db.ts`).

- [ ] **Step 1: Zugriffskontrolle + Verwaltung testen** — an `e2e/faq.e2e.ts` anhängen (Helfer-Namen vor dem Schreiben in `e2e/helpers/db.ts` und `e2e/helpers/flows.ts` verifizieren und ggf. an die dort tatsächlich exportierten Namen anpassen):

```ts
test.describe("Board-Verwaltung /federal/faq", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a plain member cannot reach /federal/faq", async ({ page }) => {
    const email = "faq-plain@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Plain" });

    await page.goto("/federal/faq");
    await page.waitForURL("**/account**");
  });

  test("a federal board member creates, publishes and reorders an entry", async ({ page }) => {
    const email = "faq-board@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Board" });
    await grantFederalBoard(email);

    await page.goto("/federal/faq");
    await expect(page.getByRole("heading", { name: "FAQ" })).toBeVisible();

    await page.getByRole("button", { name: "+ Eintrag" }).click();
    await page.getByPlaceholder("Frage").fill("E2E-Testfrage?");
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByText("E2E-Testfrage?")).toBeVisible();
    await expect(page.getByText("Veröffentlicht")).toBeVisible();

    await page.goto("/faq");
    await page.getByPlaceholder("Suche").fill("E2E-Testfrage");
    await expect(page.locator("mark").first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Lokal grün** — Run: `pnpm exec playwright test e2e/faq.e2e.ts` (mit laufender DB, `faq_suite`-Flag) → PASS.
- [ ] **Step 3: Commit + Push + PR**

```bash
git add e2e/faq.e2e.ts
git commit -m "feat(faq): E2E für Board-Zugriffskontrolle und Eintrags-Verwaltung"
git push
gh pr create --title "feat(faq): Board-Oberfläche /federal/faq (FAQ-Suite v2, PR 3)" --body "$(cat <<'EOF'
FAQ-Suite v2, PR 3 von 5 (Spec: docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md §6, §9).

- /federal/faq: Bundesvorstand verwaltet Einträge (anlegen/bearbeiten/veröffentlichen/löschen) im Dialog
- Themen inline verwaltbar + Anlegen-Dialog, Reihenfolge per Auf/Ab
- YouTube-URL-Parser mit Vorschau, verwandte Einträge, "Anzeigen bei"-Kontext-Zuordnung (Register vorgezogen aus PR 5)
- Alle Schreibpfade federal-board-only (isFederalBoard); Nicht-Board-Zugriff auf /federal/faq → /account

⚠️ Berührt Berechtigungen — /security-review vor Merge.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Danach `/review` **und** `/security-review` auf den PR (CLAUDE.md §4, Spec §9).

---

## Self-Review (erledigt)

- Spec §6 abgedeckt: Board-Tab „Fragen & Antworten" ✓ (T8), Themen inline + Anlegen-Dialog ✓ (T6), Feedback-Zähler-Anzeige ✓ (T8, Zahlen bleiben bei 0 bis PR 4 Voting liefert — bewusst), Formular-Felder (Frage/Bereich+Untergruppe/Thema/Body/YouTube/Verwandte/„Anzeigen bei"/Speichern-Veröffentlichen) ✓ (T7), Modal-Pflicht via `Dialog` ✓ (T6, T7). §3 Kontext-Register ✓ (T1, bewusst vorgezogen — Architecture-Absatz erklärt warum). §4 Autorisierung (`isFederalBoard` auf jeder Schreib-Action) ✓ (T4). §9 „Kontext-Zuordnung" ✓ (T7 FilterChip-Multi-Select).
- Nicht in diesem PR (laut Spec-Schnitt §9 explizit PR 4/5): „Offene Fragen"-Tab, Submission-Dialog auf der Leseseite, Daumen-Voting selbst, Übersichtskarte, Hilfe-Panel, `<FaqHinweis>`, Routen-Matching für Kontexte.
- Platzhalter: keine offenen; wo Repo-Details unklar sind (E2E-Helfer für einen `federal_board`-Test-Account, `Input`-Props für `className`), steht die Nachschlag-Anweisung mit Fundort.
- Typkonsistenz: `ActionResult` identisch in T4 und allen Aufrufstellen (T6, T7, T8); `FaqEntryDialogInitial` identisch in T7 (Definition) und T8 (`toInitial`/`EMPTY_ENTRY`); `ScopeGroup`/`groupByScope` identisch in T3 (Definition), T8 (Verwendung).
- Abhängigkeit: Plan setzt PR-1- und PR-2-Merge voraus (Global Constraints, Satz 1).
