# FAQ-Suite v2 — PR 1: Modul `modules/faq` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein neues Modul `modules/faq`, das FAQ-Einträge, Themen, Kontexte, Feedback und Einreichungen als DB-Daten besitzt — Schema, Migrationen, auth-agnostische Services, Seed aus dem statischen Content, Integrationstests gegen Docker-Postgres.

**Architecture:** Spiegelt `modules/content` (kleinstes aktuelles Modul): eigenes Workspace-Paket `@bdas/faq`, Drizzle-Schema, SQL-Migrationen unter `modules/faq/migrations/` (im Manifest registriert), Services ohne Autorisierung (App-Schicht autorisiert, Spec §4), privater Test-Harness. User-IDs sind Plain-Text ohne Cross-Modul-FK (Blog-Präzedenz) — der Test-Harness braucht nur die eigenen Migrationen.

**Tech Stack:** TypeScript, Drizzle ORM, postgres-js, Zod, Vitest, Docker-Postgres (`postgres://bdas:bdas@localhost:5432/bdas`).

**Spec:** `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md`

## Global Constraints

- CLAUDE.md §1: Nur `modules/faq` liest/schreibt `faq_*`-Tabellen; öffentliche Oberfläche ist ausschließlich `modules/faq/src/index.ts` (Rest privat, ESLint-Boundary).
- CLAUDE.md §3: Migrationen laufen über `infra/migrations/src/manifest.ts`, nie per Directory-Walk. Integrationstests gegen echtes Postgres, keine DB-Mocks.
- Spec §4: Services sind **auth-agnostisch** — keine `grants`-Prüfungen im Modul (anders als `content.savePage`); nur Validierung.
- Spec §3: Sichtbarkeit wird **nicht** gespeichert; `section`/`subgroup` sind Enums, Mapping auf `visibleTo` bleibt in `apps/web/lib/faq`.
- Jede Tabelle: `ENABLE ROW LEVEL SECURITY` ohne Policy (Lockdown-Muster aus `modules/content/migrations/0001_init.sql`).
- Feature-Flag `faq_suite` in `core/feature-flags` (Default OFF).
- Alle Fehlermeldungen deutsch, via `@bdas/errors` (`ValidationError`, `NotFoundError`).
- Vor jedem Commit: `pnpm prettier --write` auf die geänderten Dateien.

## File Structure

```
modules/faq/
  package.json            @bdas/faq (deps: @bdas/db, @bdas/errors, drizzle-orm, postgres, zod)
  tsconfig.json           Kopie von modules/content/tsconfig.json
  README.md               Modul-Zweck, Tabellen, Service-Überblick
  migrations/
    0001_init.sql         6 Tabellen + RLS
    0002_seed.sql         generiert (Task 9), statischer Content → Zeilen
  src/
    index.ts              öffentliche Oberfläche
    schema.ts             Drizzle-Tabellen
    types.ts              Enums, Zod-Schemas, DTO-Typen
    test-db.ts            privater Test-Harness (Muster: content)
    services/topics.ts    Themen-CRUD + Reorder
    services/entries.ts   Eintrags-CRUD, Publish, Reorder, Kontexte, Links
    services/feedback.ts  Upsert + Aggregat
    services/submissions.ts  Create/List/Count/Discard/Attach
    services/*.test.ts    je Service eine Testdatei
scripts/generate-faq-seed.ts   (apps/web) einmaliger Konverter → 0002_seed.sql
```

Geändert: `infra/migrations/src/manifest.ts` (+"faq"), `core/feature-flags/src/index.ts` (+"faq_suite"), Root-`pnpm-workspace.yaml` erfasst `modules/*` bereits.

---

### Task 1: Paket-Gerüst + Migration 0001 + Schema

**Files:**

- Create: `modules/faq/package.json`, `modules/faq/tsconfig.json`, `modules/faq/README.md`
- Create: `modules/faq/migrations/0001_init.sql`
- Create: `modules/faq/src/schema.ts`
- Modify: `infra/migrations/src/manifest.ts` (Eintrag `"faq"` ans Ende)
- Modify: `core/feature-flags/src/index.ts` (Flag `"faq_suite"` in `FLAGS`)

**Interfaces:**

- Produces: Drizzle-Tabellen `faqTopics`, `faqEntries`, `faqEntryLinks`, `faqFeedback`, `faqSubmissions`, `faqEntryContexts` aus `./schema`; SQL-Tabellen `faq_*`.

- [ ] **Step 1: package.json / tsconfig / README anlegen**

`package.json` — exakt wie `modules/content/package.json`, aber Name `@bdas/faq` und ohne `@bdas/events`:

```json
{
  "name": "@bdas/faq",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run --dir src" },
  "dependencies": {
    "@bdas/db": "workspace:*",
    "@bdas/errors": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "zod": "^3.23.8"
  }
}
```

`tsconfig.json`: Datei `modules/content/tsconfig.json` unverändert kopieren.
`README.md`: 10 Zeilen — Zweck (FAQ-Daten, Spec-Link), Tabellenliste, Hinweis „Services auth-agnostisch, App-Schicht autorisiert".
Danach `pnpm install` (verlinkt das neue Workspace-Paket).

- [ ] **Step 2: Migration schreiben**

`modules/faq/migrations/0001_init.sql`:

```sql
-- FAQ module — board-editable FAQ entries, topics, contexts, feedback,
-- submissions (docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md).
-- User references are plain auth-user ids, no cross-module FK (blog precedent).

CREATE TABLE faq_topics (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  position    integer NOT NULL DEFAULT 0
);

CREATE TABLE faq_entries (
  id          text PRIMARY KEY,
  section     text NOT NULL CHECK (section IN ('allgemein','bundesvorstand','vorstand','mitglieder')),
  subgroup    text CHECK (subgroup IN ('local_board_lead','local_board','event_organizer','page_editor')),
  topic_id    text REFERENCES faq_topics(id) ON DELETE SET NULL,
  question    text NOT NULL,
  body        jsonb NOT NULL,
  youtube_id  text,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE faq_entry_links (
  entry_id          text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  related_entry_id  text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, related_entry_id),
  CHECK (entry_id <> related_entry_id)
);

CREATE TABLE faq_entry_contexts (
  entry_id  text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  context   text NOT NULL,
  PRIMARY KEY (entry_id, context)
);

CREATE TABLE faq_feedback (
  entry_id    text NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  helpful     boolean NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, user_id)
);

CREATE TABLE faq_submissions (
  id            text PRIMARY KEY,
  question      text NOT NULL,
  details       text,
  context       text,
  submitted_by  text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','discarded')),
  entry_id      text REFERENCES faq_entries(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    text,
  decided_at    timestamptz
);

CREATE INDEX faq_entries_section_idx ON faq_entries (section, status, position);
CREATE INDEX faq_submissions_status_idx ON faq_submissions (status, created_at);

-- RLS lockdown: app reaches these tables only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- anon/authenticated denied.
ALTER TABLE faq_topics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entry_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entry_contexts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_submissions     ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 3: Drizzle-Schema schreiben**

`modules/faq/src/schema.ts` (Spalten 1:1 zur Migration):

```ts
import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const faqTopics = pgTable("faq_topics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const faqEntries = pgTable("faq_entries", {
  id: text("id").primaryKey(),
  section: text("section").notNull(),
  subgroup: text("subgroup"),
  topicId: text("topic_id").references(() => faqTopics.id, { onDelete: "set null" }),
  question: text("question").notNull(),
  body: jsonb("body").notNull(),
  youtubeId: text("youtube_id"),
  status: text("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

export const faqEntryLinks = pgTable(
  "faq_entry_links",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    relatedEntryId: text("related_entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.relatedEntryId] })],
);

export const faqEntryContexts = pgTable(
  "faq_entry_contexts",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    context: text("context").notNull(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.context] })],
);

export const faqFeedback = pgTable(
  "faq_feedback",
  {
    entryId: text("entry_id")
      .notNull()
      .references(() => faqEntries.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    helpful: boolean("helpful").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId] })],
);

export const faqSubmissions = pgTable("faq_submissions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  details: text("details"),
  context: text("context"),
  submittedBy: text("submitted_by").notNull(),
  status: text("status").notNull().default("open"),
  entryId: text("entry_id").references(() => faqEntries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});
```

Hinweis: Falls die Drizzle-Version im Repo für Composite-PKs die Objekt-Form verlangt (`(t) => ({ pk: primaryKey(...) })` statt Array), an die Form in `modules/auth/src/schema.ts` anpassen — dort steht das gültige Muster.

- [ ] **Step 4: Manifest + Flag registrieren**

`infra/migrations/src/manifest.ts` — ans Array-Ende:

```ts
  "profile",
  // FAQ suite v2 (spec 2026-09-04): faq_* tables, no cross-module FK.
  "faq",
```

`core/feature-flags/src/index.ts` — in `FLAGS` nach `"faq"`:

```ts
  "faq",
  "faq_suite",
```

- [ ] **Step 5: Typecheck + Commit**

Run: `pnpm --filter @bdas/faq typecheck && pnpm --filter @bdas/feature-flags test`
Expected: beide grün (feature-flags-Tests dürfen die neue Konstante nicht brechen; falls ein Test die Flag-Liste snapshottet, Snapshot aktualisieren).

```bash
git add modules/faq infra/migrations/src/manifest.ts core/feature-flags/src/index.ts pnpm-lock.yaml
git commit -m "feat(faq): Modul-Gerüst, Schema und Migration 0001"
```

---

### Task 2: Typen + Zod-Validierung

**Files:**

- Create: `modules/faq/src/types.ts`
- Test: `modules/faq/src/types.test.ts`

**Interfaces:**

- Produces:
  - `type FaqSectionKey = "allgemein" | "bundesvorstand" | "vorstand" | "mitglieder"`
  - `type FaqSubgroupKey = "local_board_lead" | "local_board" | "event_organizer" | "page_editor"`
  - `type FaqEntryStatus = "draft" | "published"`, `type FaqSubmissionStatus = "open" | "answered" | "discarded"`
  - `type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> }`
  - `TiptapDocSchema: z.ZodType` (shallow, wie `modules/events`), `MAX_BODY_BYTES = 256 * 1024`
  - `type FaqEntry = { id; section; subgroup; topicId; question; body: TiptapDoc; youtubeId; status; position; updatedAt: Date; updatedBy: string | null; relatedIds: readonly string[]; contexts: readonly string[] }`
  - `type FaqTopic = { id: string; name: string; position: number }`
  - `type FaqSubmission = { id; question; details: string | null; context: string | null; submittedBy; status; entryId: string | null; createdAt: Date }`
  - `newId(): string` (Wrapper um `crypto.randomUUID()`)

- [ ] **Step 1: Failing Test schreiben**

`modules/faq/src/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { TiptapDocSchema } from "./types";

describe("TiptapDocSchema", () => {
  it("accepts a minimal doc", () => {
    expect(TiptapDocSchema.safeParse({ type: "doc", content: [] }).success).toBe(true);
  });
  it("rejects a non-doc root and non-objects", () => {
    expect(TiptapDocSchema.safeParse({ type: "paragraph" }).success).toBe(false);
    expect(TiptapDocSchema.safeParse("hallo").success).toBe(false);
    expect(TiptapDocSchema.safeParse(null).success).toBe(false);
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

Run: `pnpm --filter @bdas/faq test`
Expected: FAIL — `types` existiert nicht.

- [ ] **Step 3: types.ts implementieren**

```ts
import { z } from "zod";

export const FAQ_SECTIONS = ["allgemein", "bundesvorstand", "vorstand", "mitglieder"] as const;
export type FaqSectionKey = (typeof FAQ_SECTIONS)[number];

export const FAQ_SUBGROUPS = [
  "local_board_lead",
  "local_board",
  "event_organizer",
  "page_editor",
] as const;
export type FaqSubgroupKey = (typeof FAQ_SUBGROUPS)[number];

export type FaqEntryStatus = "draft" | "published";
export type FaqSubmissionStatus = "open" | "answered" | "discarded";

/** Shallow wie modules/events: die App rendert defensiv, das Modul prüft nur die Wurzel. */
export type TiptapDoc = { readonly type: "doc"; readonly content?: ReadonlyArray<unknown> };
export const TiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.unknown()).optional(),
});
export const MAX_BODY_BYTES = 256 * 1024;

export type FaqTopic = { id: string; name: string; position: number };

export type FaqEntry = {
  id: string;
  section: FaqSectionKey;
  subgroup: FaqSubgroupKey | null;
  topicId: string | null;
  question: string;
  body: TiptapDoc;
  youtubeId: string | null;
  status: FaqEntryStatus;
  position: number;
  updatedAt: Date;
  updatedBy: string | null;
  relatedIds: readonly string[];
  contexts: readonly string[];
};

export type FaqSubmission = {
  id: string;
  question: string;
  details: string | null;
  context: string | null;
  submittedBy: string;
  status: FaqSubmissionStatus;
  entryId: string | null;
  createdAt: Date;
};

export const newId = (): string => crypto.randomUUID();
```

- [ ] **Step 4: Test grün sehen** — Run: `pnpm --filter @bdas/faq test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/faq/src/types.ts modules/faq/src/types.test.ts
git commit -m "feat(faq): Typen und Tiptap-Validierung"
```

---

### Task 3: Test-Harness

**Files:**

- Create: `modules/faq/src/test-db.ts`

**Interfaces:**

- Consumes: `createTestDb, TestDb` aus `@bdas/db/test`.
- Produces: `setupFaqDb(): Promise<TestDb>`, `dbReachable(): Promise<boolean>`, `FAQ_TEST_MIGRATIONS`.

- [ ] **Step 1: Datei schreiben**

`modules/content/src/test-db.ts` kopieren; ersetzen: Kommentarkopf (FAQ, „faq\_\* haben keine Cross-Modul-FKs"), `CONTENT_TEST_MIGRATIONS` → `FAQ_TEST_MIGRATIONS` (nur `["..", "migrations", "0001_init.sql"]` — der Seed wird in Tests **nicht** eingespielt, Tests bauen ihre eigenen Fixtures), `setupContentDb` → `setupFaqDb`.

- [ ] **Step 2: Smoke-Verifikation**

Run: `docker ps | grep postgres || docker compose up -d postgres` (Projektwurzel), dann `pnpm --filter @bdas/faq typecheck`
Expected: typecheck grün. (Erster echter DB-Zugriff folgt in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add modules/faq/src/test-db.ts
git commit -m "test(faq): Docker-Postgres-Harness"
```

---

### Task 4: Topics-Service (TDD)

**Files:**

- Create: `modules/faq/src/services/topics.ts`
- Test: `modules/faq/src/services/topics.test.ts`

**Interfaces:**

- Consumes: `setupFaqDb, dbReachable` aus `../test-db`; `faqTopics` aus `../schema`; `newId, FaqTopic` aus `../types`.
- Produces (alle nehmen `db: Db` als erstes Argument, `export type Db = PostgresJsDatabase<Record<string, never>>` wie content):
  - `listTopics(db): Promise<FaqTopic[]>` — sortiert nach `position, name`
  - `createTopic(db, { name }): Promise<FaqTopic>` — `position` = max+1; leerer/zu langer Name (>80) → `ValidationError`
  - `renameTopic(db, { id, name }): Promise<FaqTopic>` — unbekannte id → `NotFoundError`
  - `reorderTopics(db, { orderedIds }): Promise<void>` — schreibt `position` = Array-Index
  - `deleteTopic(db, { id }): Promise<void>` — Einträge behalten via `ON DELETE SET NULL` ihr `topic_id = null`

- [ ] **Step 1: Failing Tests schreiben**

`modules/faq/src/services/topics.test.ts` — Muster: `describe.skipIf(!(await dbReachable()))` wie in `modules/content/src/index.test.ts` (dort nachschlagen, gleiche Struktur verwenden: `beforeEach` frisches Schema via `setupFaqDb`, `afterEach` teardown):

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import { createTopic, deleteTopic, listTopics, renameTopic, reorderTopics } from "./topics";

const reachable = await dbReachable();

describe.skipIf(!reachable)("topics service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.teardown();
  });

  it("creates and lists in position order", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    const b = await createTopic(t.db, { name: "Dateien" });
    await reorderTopics(t.db, { orderedIds: [b.id, a.id] });
    const names = (await listTopics(t.db)).map((x) => x.name);
    expect(names).toEqual(["Dateien", "Events"]);
  });

  it("rejects an empty name", async () => {
    await expect(createTopic(t.db, { name: "  " })).rejects.toThrow();
  });

  it("renames; unknown id throws NotFound", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    const r = await renameTopic(t.db, { id: a.id, name: "Veranstaltungen" });
    expect(r.name).toBe("Veranstaltungen");
    await expect(renameTopic(t.db, { id: "nope", name: "x" })).rejects.toThrow();
  });

  it("delete keeps referencing entries (topic_id nulled by FK)", async () => {
    const a = await createTopic(t.db, { name: "Events" });
    await deleteTopic(t.db, { id: a.id });
    expect(await listTopics(t.db)).toEqual([]);
  });
});
```

Hinweis: `TestDb`-Feldnamen (`db`, `client`, `teardown`) gegen `core/db/src/test.ts` prüfen und exakt übernehmen.

- [ ] **Step 2: Fehlschlag sehen** — Run: `pnpm --filter @bdas/faq test` → FAIL (Modul fehlt).

- [ ] **Step 3: topics.ts implementieren**

```ts
import { asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { faqTopics } from "../schema";
import { newId, type FaqTopic } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const MAX_NAME = 80;

function checkName(name: string): string {
  const n = name.trim();
  if (n.length === 0 || n.length > MAX_NAME) throw new ValidationError("Ungültiger Themenname.");
  return n;
}

export async function listTopics(db: Db): Promise<FaqTopic[]> {
  return db.select().from(faqTopics).orderBy(asc(faqTopics.position), asc(faqTopics.name));
}

export async function createTopic(db: Db, input: { name: string }): Promise<FaqTopic> {
  const name = checkName(input.name);
  const [row] = await db
    .insert(faqTopics)
    .values({
      id: newId(),
      name,
      position: sql`coalesce((select max(position) from faq_topics), -1) + 1`,
    })
    .returning();
  return row!;
}

export async function renameTopic(db: Db, input: { id: string; name: string }): Promise<FaqTopic> {
  const name = checkName(input.name);
  const [row] = await db
    .update(faqTopics)
    .set({ name })
    .where(eq(faqTopics.id, input.id))
    .returning();
  if (!row) throw new NotFoundError("Thema nicht gefunden.");
  return row;
}

export async function reorderTopics(
  db: Db,
  input: { orderedIds: readonly string[] },
): Promise<void> {
  for (const [i, id] of input.orderedIds.entries()) {
    await db.update(faqTopics).set({ position: i }).where(eq(faqTopics.id, id));
  }
}

export async function deleteTopic(db: Db, input: { id: string }): Promise<void> {
  await db.delete(faqTopics).where(eq(faqTopics.id, input.id));
}
```

(Falls `@bdas/errors` keinen `NotFoundError` exportiert: `grep -n "export class" core/errors/src/*.ts` und die vorhandene nächstliegende Klasse verwenden — im ganzen Plan konsistent.)

- [ ] **Step 4: Tests grün** — Run: `pnpm --filter @bdas/faq test` → PASS (Docker-Postgres muss laufen).

- [ ] **Step 5: Commit**

```bash
git add modules/faq/src/services/topics.ts modules/faq/src/services/topics.test.ts
git commit -m "feat(faq): Topics-Service mit Reorder"
```

---

### Task 5: Entries-Service — CRUD + Kontexte + Links (TDD)

**Files:**

- Create: `modules/faq/src/services/entries.ts`
- Test: `modules/faq/src/services/entries.test.ts`

**Interfaces:**

- Consumes: Schema-Tabellen, `TiptapDocSchema, MAX_BODY_BYTES, newId`, Typen aus `../types`; `Db` aus `./topics`.
- Produces:
  - `type EntryInput = { section: FaqSectionKey; subgroup?: FaqSubgroupKey | null; topicId?: string | null; question: string; body: unknown; youtubeId?: string | null; relatedIds?: readonly string[]; contexts?: readonly string[] }`
  - `createEntry(db, input: EntryInput & { updatedBy: string }): Promise<FaqEntry>` — Status `draft`, `position` = max+1 innerhalb `(section, subgroup)`
  - `updateEntry(db, { id, ...EntryInput, updatedBy }): Promise<FaqEntry>` — ersetzt Links/Kontexte vollständig (delete + insert), setzt `updated_at`
  - `deleteEntry(db, { id }): Promise<void>`
  - `publishEntry(db, { id, updatedBy }): Promise<FaqEntry>` — Status → `published`; markiert eine via `faq_submissions.entry_id` verknüpfte Submission als `answered` (`decided_by = updatedBy`, `decided_at = now`)
  - `unpublishEntry(db, { id, updatedBy }): Promise<FaqEntry>` — zurück auf `draft`
  - `listEntries(db, opts?: { status?: FaqEntryStatus }): Promise<FaqEntry[]>` — sortiert `section, subgroup nulls first, position`; `relatedIds`/`contexts` aggregiert
  - `listEntriesByContext(db, context: string): Promise<FaqEntry[]>` — nur `published`
  - `reorderEntries(db, { section, subgroup, orderedIds }): Promise<void>`
- Validierung: `question` 1–300 Zeichen; `body` via `TiptapDocSchema` + `MAX_BODY_BYTES`; `subgroup` nur erlaubt wenn `section === "vorstand"`, sonst `ValidationError`; `youtubeId` matcht `/^[A-Za-z0-9_-]{11}$/` oder null; `relatedIds` dürfen nicht die eigene id enthalten.

- [ ] **Step 1: Failing Tests schreiben**

`modules/faq/src/services/entries.test.ts` (gleiches Harness-Muster wie Task 4):

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import {
  createEntry,
  deleteEntry,
  listEntries,
  listEntriesByContext,
  publishEntry,
  reorderEntries,
  updateEntry,
} from "./entries";
import { createSubmission, listSubmissions } from "./submissions";

const reachable = await dbReachable();
const doc = { type: "doc", content: [] };
const base = {
  section: "mitglieder",
  question: "Wie trete ich bei?",
  body: doc,
  updatedBy: "u1",
} as const;

describe.skipIf(!reachable)("entries service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.teardown();
  });

  it("creates a draft with position within (section, subgroup)", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    expect(a.status).toBe("draft");
    expect([a.position, b.position]).toEqual([0, 1]);
  });

  it("rejects subgroup outside vorstand and a bad youtube id", async () => {
    await expect(createEntry(t.db, { ...base, subgroup: "local_board" })).rejects.toThrow();
    await expect(createEntry(t.db, { ...base, youtubeId: "kurz" })).rejects.toThrow();
  });

  it("update replaces contexts and related ids wholesale", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, contexts: ["profil"], relatedIds: [other.id] });
    const upd = await updateEntry(t.db, {
      id: a.id,
      ...base,
      contexts: ["dateien"],
      relatedIds: [],
      updatedBy: "u2",
    });
    expect(upd.contexts).toEqual(["dateien"]);
    expect(upd.relatedIds).toEqual([]);
    expect(upd.updatedBy).toBe("u2");
  });

  it("listEntriesByContext returns only published entries", async () => {
    const a = await createEntry(t.db, { ...base, contexts: ["profil"] });
    expect(await listEntriesByContext(t.db, "profil")).toEqual([]);
    await publishEntry(t.db, { id: a.id, updatedBy: "u1" });
    expect((await listEntriesByContext(t.db, "profil")).map((e) => e.id)).toEqual([a.id]);
  });

  it("publish marks a linked submission answered", async () => {
    const sub = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    const a = await createEntry(t.db, { ...base, submissionId: sub.id });
    await publishEntry(t.db, { id: a.id, updatedBy: "board1" });
    const [s] = await listSubmissions(t.db);
    expect(s!.status).toBe("answered");
    expect(s!.entryId).toBe(a.id);
  });

  it("delete cascades links without touching the related entry", async () => {
    const other = await createEntry(t.db, { ...base, question: "Andere?" });
    const a = await createEntry(t.db, { ...base, relatedIds: [other.id] });
    await deleteEntry(t.db, { id: a.id });
    const left = await listEntries(t.db);
    expect(left.map((e) => e.id)).toEqual([other.id]);
  });

  it("reorder rewrites positions from the given order", async () => {
    const a = await createEntry(t.db, { ...base });
    const b = await createEntry(t.db, { ...base, question: "Zweite?" });
    await reorderEntries(t.db, { section: "mitglieder", subgroup: null, orderedIds: [b.id, a.id] });
    const ids = (await listEntries(t.db)).map((e) => e.id);
    expect(ids).toEqual([b.id, a.id]);
  });
});
```

Ergänzung zum Interface: `createEntry` akzeptiert optional `submissionId?: string` und setzt dann `faq_submissions.entry_id` auf den neuen Eintrag (Status bleibt `open`, bis publiziert wird). Der Test oben nutzt das.

- [ ] **Step 2: Fehlschlag sehen** — Run: `pnpm --filter @bdas/faq test src/services/entries.test.ts` → FAIL.

- [ ] **Step 3: entries.ts implementieren**

Kernpunkte (vollständige Datei schreiben, ~180 Zeilen):

```ts
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { NotFoundError, ValidationError } from "@bdas/errors";

import { faqEntries, faqEntryContexts, faqEntryLinks, faqSubmissions } from "../schema";
import {
  FAQ_SECTIONS,
  FAQ_SUBGROUPS,
  MAX_BODY_BYTES,
  TiptapDocSchema,
  newId,
  type FaqEntry,
  type FaqEntryStatus,
  type FaqSectionKey,
  type FaqSubgroupKey,
  type TiptapDoc,
} from "../types";
import type { Db } from "./topics";

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_QUESTION = 300;

export type EntryInput = {
  section: FaqSectionKey;
  subgroup?: FaqSubgroupKey | null;
  topicId?: string | null;
  question: string;
  body: unknown;
  youtubeId?: string | null;
  relatedIds?: readonly string[];
  contexts?: readonly string[];
};

function validate(input: EntryInput, selfId?: string): { question: string; body: TiptapDoc } {
  const question = input.question.trim();
  if (question.length === 0 || question.length > MAX_QUESTION)
    throw new ValidationError("Ungültige Frage (1–300 Zeichen).");
  if (!(FAQ_SECTIONS as readonly string[]).includes(input.section))
    throw new ValidationError("Ungültiger Bereich.");
  if (input.subgroup != null) {
    if (
      input.section !== "vorstand" ||
      !(FAQ_SUBGROUPS as readonly string[]).includes(input.subgroup)
    )
      throw new ValidationError("Untergruppen gibt es nur im Bereich Vorstand.");
  }
  if (input.youtubeId != null && !YOUTUBE_ID_RE.test(input.youtubeId))
    throw new ValidationError("Ungültige YouTube-Video-ID.");
  if (selfId && (input.relatedIds ?? []).includes(selfId))
    throw new ValidationError("Ein Eintrag kann nicht mit sich selbst verwandt sein.");
  const parsed = TiptapDocSchema.safeParse(input.body);
  if (!parsed.success) throw new ValidationError("Ungültiger Antwort-Inhalt.");
  if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_BODY_BYTES)
    throw new ValidationError("Antwort zu groß (max. 256 KB).");
  return { question, body: parsed.data as TiptapDoc };
}
```

Weitere Implementierungspunkte:

- `create`: `position: sql`coalesce((select max(position) from faq_entries where section = ${...} and subgroup is not distinct from ${...}), -1) + 1``; danach Links/Kontexte einfügen; bei `submissionId`: `update faq_submissions set entry_id = <newId> where id = <submissionId> and status = 'open'`.
- `assemble(db, rows)`: Hilfsfunktion, die für eine Zeilenmenge `relatedIds` und `contexts` per `inArray` nachlädt und `FaqEntry[]` baut — von `listEntries`, `listEntriesByContext` und den Einzel-Rückgaben (`create/update/publish` laden den Eintrag danach über `assemble` einer Ein-Zeilen-Menge) gemeinsam genutzt.
- `publishEntry`: Update Status; wenn eine Submission mit `entry_id = id` existiert → `status = 'answered', decided_by, decided_at = now()`.
- `reorderEntries`: `subgroup: FaqSubgroupKey | null` — Vergleich mit `is not distinct from` bzw. `isNull()`.
- Sortierung `listEntries`: `asc(faqEntries.section), sql`${faqEntries.subgroup} nulls first`, asc(faqEntries.position)`.

- [ ] **Step 4: Tests grün** — Run: `pnpm --filter @bdas/faq test src/services/entries.test.ts` → PASS. (Der Submissions-Test schlägt noch fehl, bis Task 6 fertig ist — die zwei Tasks in einem Rutsch bis zum gemeinsamen Grün ziehen, aber getrennt committen.)

- [ ] **Step 5: Commit**

```bash
git add modules/faq/src/services/entries.ts modules/faq/src/services/entries.test.ts
git commit -m "feat(faq): Entries-Service — CRUD, Publish, Kontexte, Links"
```

---

### Task 6: Submissions-Service (TDD)

**Files:**

- Create: `modules/faq/src/services/submissions.ts`
- Test: `modules/faq/src/services/submissions.test.ts`

**Interfaces:**

- Consumes: `faqSubmissions` aus `../schema`, `newId`, Typen; `Db` aus `./topics`.
- Produces:
  - `createSubmission(db, { question, details?, context?, submittedBy }): Promise<FaqSubmission>` — Frage 1–300 Zeichen, Details max 2000, sonst `ValidationError`
  - `listSubmissions(db, opts?: { status?: FaqSubmissionStatus }): Promise<FaqSubmission[]>` — neueste zuerst
  - `openSubmissionCount(db): Promise<number>`
  - `discardSubmission(db, { id, decidedBy }): Promise<void>` — `status='discarded'`, `decided_*` gesetzt; unbekannte id → `NotFoundError`

- [ ] **Step 1: Failing Tests**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import {
  createSubmission,
  discardSubmission,
  listSubmissions,
  openSubmissionCount,
} from "./submissions";

const reachable = await dbReachable();

describe.skipIf(!reachable)("submissions service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.teardown();
  });

  it("creates open submissions and counts them", async () => {
    await createSubmission(t.db, {
      question: "Wo finde ich X?",
      submittedBy: "m1",
      context: "dateien",
    });
    await createSubmission(t.db, { question: "Und Y?", submittedBy: "m2" });
    expect(await openSubmissionCount(t.db)).toBe(2);
    const list = await listSubmissions(t.db, { status: "open" });
    expect(list).toHaveLength(2);
    expect(list[0]!.context ?? null).toBeDefined();
  });

  it("rejects an empty question", async () => {
    await expect(createSubmission(t.db, { question: " ", submittedBy: "m1" })).rejects.toThrow();
  });

  it("discard sets status and decided fields; count drops", async () => {
    const s = await createSubmission(t.db, { question: "Wo?", submittedBy: "m1" });
    await discardSubmission(t.db, { id: s.id, decidedBy: "board1" });
    expect(await openSubmissionCount(t.db)).toBe(0);
    const [row] = await listSubmissions(t.db);
    expect(row!.status).toBe("discarded");
    await expect(discardSubmission(t.db, { id: "nope", decidedBy: "b" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Fehlschlag sehen** — Run: `pnpm --filter @bdas/faq test src/services/submissions.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — gerader Drizzle-Code nach dem Muster von Task 4/5; `listSubmissions` sortiert `desc(createdAt)`; `openSubmissionCount` via `select count(*)`.

- [ ] **Step 4: Alle Modultests grün** — Run: `pnpm --filter @bdas/faq test` → PASS (jetzt auch der Publish-→-answered-Test aus Task 5).

- [ ] **Step 5: Commit**

```bash
git add modules/faq/src/services/submissions.ts modules/faq/src/services/submissions.test.ts
git commit -m "feat(faq): Submissions-Service"
```

---

### Task 7: Feedback-Service (TDD)

**Files:**

- Create: `modules/faq/src/services/feedback.ts`
- Test: `modules/faq/src/services/feedback.test.ts`

**Interfaces:**

- Produces:
  - `upsertFeedback(db, { entryId, userId, helpful: boolean }): Promise<void>` — `onConflictDoUpdate` auf `(entry_id, user_id)`; unbekannter Eintrag → FK-Fehler wird zu `NotFoundError` übersetzt
  - `feedbackCounts(db, entryIds: readonly string[]): Promise<Map<string, { up: number; down: number }>>`

- [ ] **Step 1: Failing Tests**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupFaqDb } from "../test-db";
import { createEntry } from "./entries";
import { feedbackCounts, upsertFeedback } from "./feedback";

const reachable = await dbReachable();
const doc = { type: "doc", content: [] };

describe.skipIf(!reachable)("feedback service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupFaqDb();
  });
  afterEach(async () => {
    await t.teardown();
  });

  it("one vote per user, changeable; counts aggregate", async () => {
    const e = await createEntry(t.db, {
      section: "mitglieder",
      question: "F?",
      body: doc,
      updatedBy: "u",
    });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: true });
    await upsertFeedback(t.db, { entryId: e.id, userId: "m1", helpful: false }); // ändert die Stimme
    await upsertFeedback(t.db, { entryId: e.id, userId: "m2", helpful: true });
    const counts = await feedbackCounts(t.db, [e.id]);
    expect(counts.get(e.id)).toEqual({ up: 1, down: 1 });
  });

  it("unknown entry throws NotFound", async () => {
    await expect(
      upsertFeedback(t.db, { entryId: "nope", userId: "m1", helpful: true }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: FAIL sehen**, **Step 3: implementieren** (Insert mit `.onConflictDoUpdate({ target: [faqFeedback.entryId, faqFeedback.userId], set: { helpful, updatedAt: new Date() } })`; FK-Verletzung per try/catch → `NotFoundError("Eintrag nicht gefunden.")`; `feedbackCounts` per `group by entry_id` + `filter`-Aggregat oder zwei `count`-Ausdrücken mit `sql`), **Step 4: PASS**, **Step 5: Commit**

```bash
git add modules/faq/src/services/feedback.ts modules/faq/src/services/feedback.test.ts
git commit -m "feat(faq): Feedback-Service — eine Stimme pro Mitglied"
```

---

### Task 8: Öffentliche Oberfläche `index.ts`

**Files:**

- Create: `modules/faq/src/index.ts`

**Interfaces:**

- Produces (das ist der Vertrag für PR 2–5):

```ts
/**
 * @bdas/faq — public surface. Per CLAUDE.md §1 rule 8: nur hier
 * re-exportierte Symbole sind außerhalb sichtbar. Services sind
 * auth-agnostisch; die App-Schicht autorisiert (Spec §4).
 */

export {
  createTopic,
  deleteTopic,
  listTopics,
  renameTopic,
  reorderTopics,
} from "./services/topics";
export {
  createEntry,
  deleteEntry,
  listEntries,
  listEntriesByContext,
  publishEntry,
  reorderEntries,
  unpublishEntry,
  updateEntry,
} from "./services/entries";
export {
  createSubmission,
  discardSubmission,
  listSubmissions,
  openSubmissionCount,
} from "./services/submissions";
export { feedbackCounts, upsertFeedback } from "./services/feedback";
export { FAQ_SECTIONS, FAQ_SUBGROUPS } from "./types";
export type {
  FaqEntry,
  FaqEntryStatus,
  FaqSectionKey,
  FaqSubgroupKey,
  FaqSubmission,
  FaqSubmissionStatus,
  FaqTopic,
  TiptapDoc,
} from "./types";
export type { EntryInput } from "./services/entries";
export type { Db as FaqDb } from "./services/topics";
```

- [ ] **Step 1: Datei schreiben** (Inhalt oben), **Step 2:** Run: `pnpm --filter @bdas/faq typecheck && pnpm --filter @bdas/faq test` → grün, **Step 3: Commit**

```bash
git add modules/faq/src/index.ts
git commit -m "feat(faq): öffentliche Modul-Oberfläche"
```

---

### Task 9: Seed-Generator + Migration 0002

**Files:**

- Create: `apps/web/scripts/generate-faq-seed.ts`
- Create (generiert): `modules/faq/migrations/0002_seed.sql`
- Modify: `modules/faq/src/test-db.ts` — **nicht** (Seed bleibt aus Tests draußen; Kommentar dazu steht schon da)

**Interfaces:**

- Consumes: `SECTIONS` aus `apps/web/content/faq` (statischer Content, `FaqBlock = p | steps | link`).
- Produces: idempotentes SQL (`INSERT ... ON CONFLICT (id) DO NOTHING`) für Themen + 30 Einträge, Status `published`, `updated_by NULL`, Eintrags-IDs = bestehende statische IDs (stabile Deep-Links, Spec §8).

- [ ] **Step 1: Konverter schreiben**

`apps/web/scripts/generate-faq-seed.ts` — Block→Tiptap-Mapping:

```ts
/**
 * Einmaliger Generator: statischer FAQ-Content → modules/faq/migrations/0002_seed.sql.
 * Ausführen mit: pnpm --filter web exec tsx scripts/generate-faq-seed.ts
 * Das erzeugte SQL wird committet; dieses Skript bleibt als Dokumentation liegen.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { SECTIONS, type FaqBlock } from "../content/faq";

const TOPICS = [
  ["events", "Events"],
  ["dateien", "Dateien"],
  ["administration", "Administration"],
  ["profil", "Profil & Konto"],
  ["gruppen", "Gruppen"],
] as const;

function blockToTiptap(b: FaqBlock): unknown {
  if (b.kind === "p") return { type: "paragraph", content: [{ type: "text", text: b.text }] };
  if (b.kind === "steps")
    return {
      type: "orderedList",
      content: b.items.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
      })),
    };
  // link → Absatz mit Link-Mark
  return {
    type: "paragraph",
    content: [{ type: "text", text: b.label, marks: [{ type: "link", attrs: { href: b.href } }] }],
  };
}

const esc = (s: string) => s.replace(/'/g, "''");
const lines: string[] = [
  "-- Generated by apps/web/scripts/generate-faq-seed.ts — do not edit by hand.",
];
for (const [i, [id, name]] of TOPICS.entries())
  lines.push(
    `INSERT INTO faq_topics (id, name, position) VALUES ('${id}', '${esc(name)}', ${i}) ON CONFLICT (id) DO NOTHING;`,
  );

for (const section of Object.values(SECTIONS)) {
  const flat = [
    ...section.entries.map((e) => ({ e, subgroup: "NULL" })),
    ...(section.subgroups ?? []).flatMap((sub) =>
      sub.entries.map((e) => ({ e, subgroup: `'${sub.id}'` })),
    ),
  ];
  for (const [pos, { e, subgroup }] of flat.entries()) {
    const body = JSON.stringify({ type: "doc", content: e.body.map(blockToTiptap) });
    lines.push(
      `INSERT INTO faq_entries (id, section, subgroup, question, body, status, position) ` +
        `VALUES ('${esc(e.id)}', '${section.key}', ${subgroup}, '${esc(e.question)}', '${esc(body)}'::jsonb, 'published', ${pos}) ` +
        `ON CONFLICT (id) DO NOTHING;`,
    );
  }
}
writeFileSync(
  path.join(__dirname, "..", "..", "..", "modules", "faq", "migrations", "0002_seed.sql"),
  lines.join("\n") + "\n",
);
console.log(`wrote ${lines.length - 1} statements`);
```

(Themen-Zuordnung der Einträge: bewusst weggelassen — `topic_id` bleibt NULL, Feinzuordnung macht der Bundesvorstand im Editor, Spec §8. `__dirname`: falls das Skript als ESM läuft, `fileURLToPath(import.meta.url)` verwenden wie in `test-db.ts`.)

- [ ] **Step 2: Generieren + verifizieren**

Run: `pnpm --filter web exec tsx scripts/generate-faq-seed.ts`
Dann: `docker exec` bzw. `psql postgres://bdas:bdas@localhost:5432/bdas` — in einer Wegwerf-Schema-Session `0001_init.sql` + `0002_seed.sql` einspielen und prüfen:
`SELECT count(*) FROM faq_entries;` → 30; `SELECT count(*) FROM faq_entries WHERE section='vorstand' AND subgroup IS NOT NULL;` → Anzahl der Untergruppen-Einträge aus dem statischen Content.
(Schneller Weg: temporär in `test-db.ts` die Seed-Datei zu `FAQ_TEST_MIGRATIONS` hinzufügen, einen Wegwerf-Test laufen lassen, Änderung wieder zurücknehmen.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/generate-faq-seed.ts modules/faq/migrations/0002_seed.sql
git commit -m "feat(faq): Seed-Migration aus dem statischen Content generieren"
```

---

### Task 10: CI-Verifikation + PR

- [ ] **Step 1: Volle lokale Verifikation**

Run (Projektwurzel): `pnpm -r typecheck && pnpm --filter @bdas/faq test && pnpm prettier --check modules/faq apps/web/scripts`
Expected: alles grün.

- [ ] **Step 2: Prüfen, dass der Migrations-Runner das Modul sieht**

Run: `grep -n "faq" infra/migrations/src/manifest.ts` und die Discover-Tests: `pnpm --filter @bdas/migrations test` (Paketname vorher in `infra/migrations/package.json` nachschlagen). `discover.test.ts` erwartet ggf. eine feste Modulliste — dann dort `"faq"` ergänzen.
Expected: grün.

- [ ] **Step 3: Branch pushen + PR**

```bash
git push -u origin feat/faq-suite-v2
gh pr create --title "feat(faq): Modul modules/faq — Schema, Services, Seed (FAQ-Suite v2, PR 1)" --body "$(cat <<'EOF'
FAQ-Suite v2, PR 1 von 5 (Spec: docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md).

- Neues Modul modules/faq: 6 Tabellen (Einträge, Themen, Links, Kontexte, Feedback, Einreichungen), RLS-Lockdown
- Auth-agnostische Services (App-Schicht autorisiert, Spec §4); Publish markiert verknüpfte Submission als answered
- Seed-Migration aus dem bisherigen statischen Content (IDs stabil), Flag faq_suite (OFF)
- Integrationstests gegen Docker-Postgres

Noch ohne UI — /faq rendert weiterhin die statische Seite. UI folgt in PR 2.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Danach `/review` auf den PR (Working Agreement §4).

---

## Self-Review (erledigt)

- Spec-Abdeckung PR 1: Tabellen §3 ✓ (inkl. `context`-Spalte + `faq_entry_contexts`), Services §4 ✓ (`listEntriesByContext` ✓), Seed §8 ✓ (IDs stabil, published, Themen angelegt, `topic_id`-Feinzuordnung bewusst dem Board überlassen), Flag §9 ✓, Tests §10 (Modulteil) ✓. Kontext-**Register** (`apps/web/lib/faq/contexts.ts`) ist App-Code → PR 5, nicht hier.
- Platzhalter: keine; überall konkreter Code oder exakte Nachschlag-Anweisung (Drizzle-PK-Form, `@bdas/errors`-Klassen, `TestDb`-Felder — mit Fundort).
- Typkonsistenz: `Db` einmal in `topics.ts` definiert, überall importiert; `FaqEntry.relatedIds/contexts` von `assemble` in Task 5 produziert und in `index.ts` re-exportiert; `createEntry`-`submissionId` in Task 5-Interface ergänzt und im Test verwendet.
