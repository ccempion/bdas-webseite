# Profile Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-phase onboarding — register with name + email + password, verify, then a guided wizard captures the full member profile (study, university, birth date, referral, photo) into a new `profile` module, and the local board approves a complete application.

**Architecture:** A new `modules/profile` owns `member_profiles` keyed by `user_id` (no cross-module FK), mirroring the `content`/`members` template: single `index.ts` surface, own schema/migration/README/tests, zod validation, in-module authorization, typed events. The wizard/account submit is orchestrated at the app layer, writing independently to `members` (names + `primary_group_id`) and `profile` (the new fields). A `profile.completed` event drives a board notification via the existing notifications subscriber. Photos live in a private `profile-media` Supabase bucket, accessed only through signed URLs.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components for reads, Server Actions/route handlers for writes), Drizzle ORM + PostgreSQL, zod, `@bdas/design-system` primitives, Supabase Storage, Vitest (+ Docker Postgres for integration).

## Global Constraints

- **Feature flag `profile`** gates every route/API/nav/subscriber; **off in production** until acceptance-complete. Env format `BDAS_FLAG_PROFILE=true`.
- **Module rules (CLAUDE.md §1):** `profile` owns `member_profiles`; no other module reads/writes it. Public surface is `modules/profile/src/index.ts` only — internal files are not importable. `members` stays unchanged in what it models (no university/degree/birthdate/photo columns).
- **Migrations namespaced:** live in `modules/profile/migrations/`, appended to `infra/migrations/src/manifest.ts` **after `"members"`**. Table has **RLS enabled, no policy** (service-role-only access), exactly like `content_pages`.
- **Enums stored as stable keys**, German labels only in the UI. Keys: `abschlussart ∈ {bachelor, master, doktor, staatsexamen, duales_studium, diplom}`, `gefunden_durch ∈ {webseite, instagram, empfehlung}`.
- **Design tokens only** (CLAUDE.md §7): never inline a hex/radius/shadow/duration. Reuse `Form`/`Field`/`Input`/`Button`/`Alert`/`Card` and the native-`<select>`-styled-as-`Input` class already in `apps/web/app/account/ProfileForm.tsx`.
- **No cross-module deep imports.** App layer orchestrates cross-module writes; modules are linked only by `user_id` and the `profile.completed` event.
- **Storage:** app never proxies file bytes (spec §11); uploads/downloads use signed URLs minted server-side. Photo bucket is **private**.
- **Tests ship in the same PR.** Module integration tests run against real Docker Postgres (no DB mocks).
- **German UI copy** throughout.

---

### Task 1: Scaffold `modules/profile` — package, schema, migration, flag, manifest, test harness

**Files:**

- Create: `modules/profile/package.json`
- Create: `modules/profile/tsconfig.json`
- Create: `modules/profile/README.md`
- Create: `modules/profile/src/schema.ts`
- Create: `modules/profile/migrations/0001_init.sql`
- Create: `modules/profile/src/test-db.ts`
- Modify: `core/feature-flags/src/index.ts` (add `"profile"` to `FLAGS`)
- Modify: `infra/migrations/src/manifest.ts` (append `"profile"` after `"members"`)
- Test: `modules/profile/src/schema.test.ts`

**Interfaces:**

- Produces: Drizzle table `memberProfiles` (export from `schema.ts`); `MemberProfileRow = typeof memberProfiles.$inferSelect`. Test harness `setupProfileDb(): Promise<TestDb>`, `dbReachable(): Promise<boolean>`.

- [ ] **Step 1: Create the package manifest**

`modules/profile/package.json`:

```json
{
  "name": "@bdas/profile",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --dir src"
  },
  "dependencies": {
    "@bdas/db": "workspace:*",
    "@bdas/errors": "workspace:*",
    "@bdas/events": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "zod": "^3.23.8"
  }
}
```

`modules/profile/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

`modules/profile/README.md`:

```markdown
# @bdas/profile

Owns `member_profiles` — the federation's extended member data (course of
study, degree type, university, birth date, "found BDAS via", optional photo).
Keyed by `user_id`, no cross-module FK. The `members` module deliberately does
**not** model these fields (platform spec §1); this module is the home for them.

Public surface: `src/index.ts` only. Authorization (owner-only writes) lives in
the service. Emits `profile.completed` / `profile.updated` on the core bus.

Photos live in the **private** `profile-media` bucket (`core/storage`
`getProfileMediaStorage()`); the app mints short-lived signed URLs — never a
public URL, never proxied bytes.
```

- [ ] **Step 2: Write the schema**

`modules/profile/src/schema.ts`:

```ts
import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Extended member profile, owned solely by @bdas/profile. Linked to identity
 * by `userId` (matches auth_users.id) with no cross-module FK, like
 * members.userId. `completed_at` stamps the first successful full submit.
 */
export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  studiengang: text("studiengang").notNull(),
  abschlussart: text("abschlussart").notNull(),
  uni: text("uni").notNull(),
  geburtsdatum: date("geburtsdatum").notNull(),
  gefundenDurch: text("gefunden_durch").notNull(),
  empfehlerName: text("empfehler_name"),
  photoStorageKey: text("photo_storage_key"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull(),
});

export type MemberProfileRow = typeof memberProfiles.$inferSelect;
```

- [ ] **Step 3: Write the migration**

`modules/profile/migrations/0001_init.sql`:

```sql
-- Profile module — extended member data (course of study, degree, university,
-- birth date, referral, optional photo). Owned solely by @bdas/profile.
-- Design: docs/superpowers/specs/2026-07-23-profile-data-design.md (#52/#96/#97).

CREATE TABLE member_profiles (
  user_id            text PRIMARY KEY,
  studiengang        text NOT NULL,
  abschlussart       text NOT NULL,
  uni                text NOT NULL,
  geburtsdatum       date NOT NULL,
  gefunden_durch     text NOT NULL,
  empfehler_name     text,
  photo_storage_key  text,
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text NOT NULL
);

-- RLS lockdown: the app reaches this table only via the service-role /
-- direct-Postgres path (bypasses RLS). No permissive policy ⇒ Supabase
-- `anon` and `authenticated` roles are denied. ENABLE is idempotent.
ALTER TABLE member_profiles ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Register the flag and migration**

In `core/feature-flags/src/index.ts`, add `"profile"` to the `FLAGS` array (append after `"content"`):

```ts
  "content",
  "profile",
] as const;
```

In `infra/migrations/src/manifest.ts`, append to `MIGRATION_MANIFEST` (order matters — after `members`, and it has no FK so appending at the end is fine):

```ts
  "content",
  "profile",
];
```

- [ ] **Step 5: Write the test harness**

`modules/profile/src/test-db.ts`:

```ts
/**
 * Private test harness for the profile module. Not re-exported from index.ts.
 * `member_profiles` has no FKs — only this module's migrations run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Migration files, in apply order. Append new profile migrations here. */
export const PROFILE_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
  ["..", "migrations", "0001_init.sql"],
];

export async function dbReachable(): Promise<boolean> {
  const url = process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 2 });
  try {
    await sql`select 1`;
    await sql.end();
    return true;
  } catch {
    try {
      await sql.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

/** Fresh schema with every profile migration applied. */
export async function setupProfileDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of PROFILE_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}
```

- [ ] **Step 6: Write the smoke test (fails until migration applies cleanly)**

`modules/profile/src/schema.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupProfileDb } from "./test-db";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

describeIfDb("member_profiles migration", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("creates the table with the expected columns", async () => {
    const cols = await t.client<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = ${t.schema} AND table_name = 'member_profiles'
    `;
    const names = cols.map((c) => c.column_name).sort();
    expect(names).toEqual(
      [
        "abschlussart",
        "completed_at",
        "empfehler_name",
        "gefunden_durch",
        "geburtsdatum",
        "photo_storage_key",
        "studiengang",
        "uni",
        "updated_at",
        "updated_by",
        "user_id",
      ].sort(),
    );
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @bdas/profile test`
Expected: PASS (or `skip` if no Docker Postgres — bring it up via the repo's test-db compose first; CI always has it). Also run `pnpm --filter @bdas/feature-flags test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add modules/profile core/feature-flags/src/index.ts infra/migrations/src/manifest.ts
git commit -m "feat(profile): scaffold module, schema, migration, flag"
```

---

### Task 2: Types, enum options, university list, and `SaveProfileInput` validation

**Files:**

- Create: `modules/profile/src/data.ts` (enum options + university list)
- Create: `modules/profile/src/types.ts` (`SaveProfileInput`, `MemberProfile`, `ProfileActor`, `ProfileFields`)
- Test: `modules/profile/src/validation.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `ABSCHLUSSART_OPTIONS: ReadonlyArray<{ value: string; label: string }>`
  - `GEFUNDEN_DURCH_OPTIONS: ReadonlyArray<{ value: string; label: string }>`
  - `UNIVERSITIES: ReadonlyArray<string>` (curated German list; the UI adds a "Sonstige" affordance separately)
  - `SONSTIGE = "Sonstige"` sentinel
  - `SaveProfileFields` (zod schema for the six domain fields) and `SaveProfileFields` type
  - `MemberProfile` type, `ProfileActor` type

- [ ] **Step 1: Write the enum options + university list**

`modules/profile/src/data.ts`:

```ts
/** Stable enum keys + German UI labels. Keys are stored; labels are display. */
export const ABSCHLUSSART_OPTIONS = [
  { value: "bachelor", label: "Bachelor" },
  { value: "master", label: "Master" },
  { value: "doktor", label: "Doktor / Promotion" },
  { value: "staatsexamen", label: "Staatsexamen" },
  { value: "duales_studium", label: "Duales Studium" },
  { value: "diplom", label: "Diplom" },
] as const;

export const GEFUNDEN_DURCH_OPTIONS = [
  { value: "webseite", label: "Webseite" },
  { value: "instagram", label: "Instagram" },
  { value: "empfehlung", label: "Empfehlung" },
] as const;

export const ABSCHLUSSART_KEYS = ABSCHLUSSART_OPTIONS.map((o) => o.value);
export const GEFUNDEN_DURCH_KEYS = GEFUNDEN_DURCH_OPTIONS.map((o) => o.value);

/** The "not in the list" affordance value. Selecting it reveals a free-text
 *  field whose typed value is stored directly in `uni`. */
export const SONSTIGE = "Sonstige";

/** Curated list of German universities. Shared by server validation and the UI
 *  so both agree on the canonical set. Extend as the federation grows. */
export const UNIVERSITIES: ReadonlyArray<string> = [
  "RWTH Aachen",
  "Universität Augsburg",
  "Universität Bamberg",
  "Universität Bayreuth",
  "Freie Universität Berlin",
  "Humboldt-Universität zu Berlin",
  "Technische Universität Berlin",
  "Universität Bielefeld",
  "Ruhr-Universität Bochum",
  "Universität Bonn",
  "Technische Universität Braunschweig",
  "Universität Bremen",
  "Technische Universität Chemnitz",
  "Technische Universität Darmstadt",
  "Technische Universität Dortmund",
  "Technische Universität Dresden",
  "Universität Duisburg-Essen",
  "Heinrich-Heine-Universität Düsseldorf",
  "Katholische Universität Eichstätt-Ingolstadt",
  "Friedrich-Alexander-Universität Erlangen-Nürnberg",
  "Universität Frankfurt (Goethe-Universität)",
  "Europa-Universität Viadrina Frankfurt (Oder)",
  "Universität Freiburg",
  "Justus-Liebig-Universität Gießen",
  "Universität Göttingen",
  "Universität Greifswald",
  "FernUniversität in Hagen",
  "Martin-Luther-Universität Halle-Wittenberg",
  "Universität Hamburg",
  "Technische Universität Hamburg",
  "Universität Hannover (Leibniz Universität)",
  "Medizinische Hochschule Hannover",
  "Universität Heidelberg",
  "Universität Hohenheim",
  "Technische Universität Ilmenau",
  "Friedrich-Schiller-Universität Jena",
  "Universität Kaiserslautern-Landau (RPTU)",
  "Karlsruher Institut für Technologie (KIT)",
  "Universität Kassel",
  "Christian-Albrechts-Universität zu Kiel",
  "Universität zu Köln",
  "Universität Konstanz",
  "Universität Leipzig",
  "Universität zu Lübeck",
  "Otto-von-Guericke-Universität Magdeburg",
  "Johannes Gutenberg-Universität Mainz",
  "Universität Mannheim",
  "Philipps-Universität Marburg",
  "Ludwig-Maximilians-Universität München (LMU)",
  "Technische Universität München (TUM)",
  "Universität Münster",
  "Universität Oldenburg",
  "Universität Osnabrück",
  "Universität Paderborn",
  "Universität Passau",
  "Universität Potsdam",
  "Universität Regensburg",
  "Universität Rostock",
  "Universität des Saarlandes",
  "Universität Siegen",
  "Universität Stuttgart",
  "Universität Trier",
  "Universität Tübingen",
  "Universität Ulm",
  "Universität Würzburg",
  "Universität Wuppertal",
];

const UNI_SET = new Set(UNIVERSITIES);
export function isKnownUniversity(value: string): boolean {
  return UNI_SET.has(value);
}
```

- [ ] **Step 2: Write the types + zod validation**

`modules/profile/src/types.ts`:

```ts
import { z } from "zod";

import { ABSCHLUSSART_KEYS, GEFUNDEN_DURCH_KEYS, isKnownUniversity } from "./data";

const MAX_TEXT = 200;
const MAX_UNI = 200;
const MIN_BIRTH_YEAR = 1900;

/**
 * The six domain fields written to member_profiles. `uni` is the *resolved*
 * university string: either a value from the curated list, or the free text a
 * user typed after choosing "Sonstige" — validated as non-empty in either case.
 * `empfehlerName` is required only when `gefundenDurch === "empfehlung"`.
 */
export const SaveProfileFields = z
  .object({
    studiengang: z.string().trim().min(1, "Bitte gib deinen Studiengang an.").max(MAX_TEXT),
    abschlussart: z.enum(ABSCHLUSSART_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle eine Abschlussart." }),
    }),
    uni: z.string().trim().min(1, "Bitte gib deine Hochschule an.").max(MAX_UNI),
    geburtsdatum: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte gib ein gültiges Datum an.")
      .refine((s) => {
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= MIN_BIRTH_YEAR && d < new Date();
      }, "Das Geburtsdatum muss in der Vergangenheit liegen."),
    gefundenDurch: z.enum(GEFUNDEN_DURCH_KEYS as [string, ...string[]], {
      errorMap: () => ({ message: "Bitte wähle aus, wie du BDAS gefunden hast." }),
    }),
    empfehlerName: z.string().trim().max(MAX_TEXT).optional().nullable(),
    photoStorageKey: z.string().trim().max(MAX_TEXT).optional().nullable(),
  })
  .refine((v) => isKnownUniversity(v.uni) || v.uni.length > 0, {
    message: "Bitte gib deine Hochschule an.",
    path: ["uni"],
  })
  .refine((v) => v.gefundenDurch !== "empfehlung" || (v.empfehlerName?.trim().length ?? 0) > 0, {
    message: "Bitte gib den Namen der empfehlenden Person an.",
    path: ["empfehlerName"],
  });

export type SaveProfileFields = z.infer<typeof SaveProfileFields>;

export type ProfileActor = {
  readonly userId: string;
  readonly grants: ReadonlyArray<{ role: string; groupId: string | null }>;
};

export type SaveProfileInput = {
  readonly userId: string;
  readonly fields: unknown;
  readonly actor: ProfileActor;
  /** Event-only: the member's primary group id, forwarded into
   *  `profile.completed` so the notifications subscriber can resolve the board.
   *  NOT persisted here — `members` owns the group (spec §9). */
  readonly groupId?: string | null;
};

export type MemberProfile = {
  readonly userId: string;
  readonly studiengang: string;
  readonly abschlussart: string;
  readonly uni: string;
  readonly geburtsdatum: string;
  readonly gefundenDurch: string;
  readonly empfehlerName: string | null;
  readonly photoStorageKey: string | null;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
  readonly updatedBy: string;
};
```

- [ ] **Step 3: Write failing validation tests**

`modules/profile/src/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { SaveProfileFields } from "./types";

const valid = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

describe("SaveProfileFields", () => {
  it("accepts a well-formed profile", () => {
    expect(SaveProfileFields.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown abschlussart", () => {
    const r = SaveProfileFields.safeParse({ ...valid, abschlussart: "habilitation" });
    expect(r.success).toBe(false);
  });

  it("rejects a future birth date", () => {
    const r = SaveProfileFields.safeParse({ ...valid, geburtsdatum: "2999-01-01" });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed birth date", () => {
    expect(SaveProfileFields.safeParse({ ...valid, geburtsdatum: "01.05.2000" }).success).toBe(
      false,
    );
  });

  it("accepts a free-text (Sonstige) university value", () => {
    const r = SaveProfileFields.safeParse({ ...valid, uni: "Hochschule Irgendwo" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty university", () => {
    expect(SaveProfileFields.safeParse({ ...valid, uni: "  " }).success).toBe(false);
  });

  it("requires empfehlerName when gefundenDurch is empfehlung", () => {
    const r = SaveProfileFields.safeParse({ ...valid, gefundenDurch: "empfehlung" });
    expect(r.success).toBe(false);
  });

  it("accepts empfehlung with a name", () => {
    const r = SaveProfileFields.safeParse({
      ...valid,
      gefundenDurch: "empfehlung",
      empfehlerName: "Ayşe Y.",
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @bdas/profile test -- validation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/profile/src/data.ts modules/profile/src/types.ts modules/profile/src/validation.test.ts
git commit -m "feat(profile): profile field validation, enum options, university list"
```

---

### Task 3: `getProfile` / `saveProfile` / `canViewProfile` services, events, public surface

**Files:**

- Create: `modules/profile/src/events.ts`
- Create: `modules/profile/src/services/profile.ts`
- Create: `modules/profile/src/index.ts`
- Test: `modules/profile/src/index.test.ts`
- Test: `modules/profile/src/index.export.test.ts`

**Interfaces:**

- Consumes: `SaveProfileFields`, `SaveProfileInput`, `MemberProfile`, `ProfileActor` (Task 2); `memberProfiles`, `MemberProfileRow` (Task 1).
- Produces (public surface `index.ts`):
  - `getProfile(db: Db, userId: string): Promise<MemberProfile | null>`
  - `saveProfile(db: Db, input: SaveProfileInput): Promise<MemberProfile>`
  - `canViewProfile(actor: ProfileActor, ownerUserId: string): boolean`
  - re-exports: `ABSCHLUSSART_OPTIONS`, `GEFUNDEN_DURCH_OPTIONS`, `UNIVERSITIES`, `SONSTIGE`, `isKnownUniversity`, types `MemberProfile`/`SaveProfileInput`/`ProfileActor`/`SaveProfileFields`, event types `ProfileCompleted`/`ProfileUpdated`/`ProfileEvent`.
  - `type Db = PostgresJsDatabase<Record<string, never>>`

- [ ] **Step 1: Write the events**

`modules/profile/src/events.ts`:

```ts
/**
 * Events emitted by the profile module. Subscribers depend on the types, not
 * on the producing service (CLAUDE.md §3). `profile.completed` fires when
 * `completed_at` transitions null → set; `profile.updated` on later edits.
 */
export type ProfileCompleted = {
  readonly type: "profile.completed";
  readonly userId: string;
  readonly groupId: string | null;
  readonly at: Date;
};

export type ProfileUpdated = {
  readonly type: "profile.updated";
  readonly userId: string;
  readonly at: Date;
};

export type ProfileEvent = ProfileCompleted | ProfileUpdated;
```

- [ ] **Step 2: Write the service**

`modules/profile/src/services/profile.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import { ForbiddenError, ValidationError } from "@bdas/errors";
import { getEventBus } from "@bdas/events";

import type { ProfileCompleted, ProfileUpdated } from "../events";
import { memberProfiles, type MemberProfileRow } from "../schema";
import { SaveProfileFields } from "../types";
import type { MemberProfile, ProfileActor, SaveProfileInput } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

const MAX_INPUT_BYTES = 16 * 1024; // profile JSON is tiny; reject anything huge

function row2profile(row: MemberProfileRow): MemberProfile {
  return {
    userId: row.userId,
    studiengang: row.studiengang,
    abschlussart: row.abschlussart,
    uni: row.uni,
    geburtsdatum: row.geburtsdatum,
    gefundenDurch: row.gefundenDurch,
    empfehlerName: row.empfehlerName,
    photoStorageKey: row.photoStorageKey,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getProfile(db: Db, userId: string): Promise<MemberProfile | null> {
  const rows = await db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.userId, userId))
    .limit(1);
  const row = rows[0];
  return row ? row2profile(row) : null;
}

/** Read authorization: the owner, or any board grant (local or federal). */
export function canViewProfile(actor: ProfileActor, ownerUserId: string): boolean {
  if (actor.userId === ownerUserId) return true;
  return actor.grants.some(
    (g) => g.role === "federal_board" || g.role === "local_board" || g.role === "local_board_lead",
  );
}

/**
 * Upsert the profile. Owner-only write. Stamps `completed_at` on the first
 * complete submit (null → now) and emits `profile.completed`; later edits emit
 * `profile.updated`. `updated_at`/`updated_by` are stamped every time.
 */
export async function saveProfile(db: Db, input: SaveProfileInput): Promise<MemberProfile> {
  if (input.actor.userId !== input.userId) {
    throw new ForbiddenError("Du darfst nur dein eigenes Profil bearbeiten.");
  }
  if (Buffer.byteLength(JSON.stringify(input.fields ?? {}), "utf8") > MAX_INPUT_BYTES) {
    throw new ValidationError("Eingabe zu groß.");
  }

  const parsed = SaveProfileFields.safeParse(input.fields);
  if (!parsed.success) {
    throw new ValidationError("Profil-Eingabe ungültig", { fields: flatten(parsed.error) });
  }
  const v = parsed.data;
  const now = new Date();

  const existing = await getProfile(db, input.userId);
  const firstComplete = existing?.completedAt == null;
  const completedAt = existing?.completedAt ?? now;

  const values = {
    userId: input.userId,
    studiengang: v.studiengang,
    abschlussart: v.abschlussart,
    uni: v.uni,
    geburtsdatum: v.geburtsdatum,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: v.gefundenDurch === "empfehlung" ? (v.empfehlerName ?? null) : null,
    photoStorageKey: v.photoStorageKey ?? existing?.photoStorageKey ?? null,
    completedAt,
    updatedAt: now,
    updatedBy: input.actor.userId,
  };

  const [row] = await db
    .insert(memberProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: memberProfiles.userId,
      set: {
        studiengang: values.studiengang,
        abschlussart: values.abschlussart,
        uni: values.uni,
        geburtsdatum: values.geburtsdatum,
        gefundenDurch: values.gefundenDurch,
        empfehlerName: values.empfehlerName,
        photoStorageKey: values.photoStorageKey,
        completedAt: values.completedAt,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      },
    })
    .returning();
  if (!row) throw new Error("saveProfile: upsert returned no row");

  if (firstComplete) {
    const event: ProfileCompleted = {
      type: "profile.completed",
      userId: input.userId,
      groupId: input.groupId ?? null,
      at: now,
    };
    await getEventBus().publish(event);
  } else {
    const event: ProfileUpdated = { type: "profile.updated", userId: input.userId, at: now };
    await getEventBus().publish(event);
  }

  return row2profile(row);
}

function flatten(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[i.path.join(".") || "_"] = i.message;
  return out;
}
```

- [ ] **Step 3: Write the public surface**

`modules/profile/src/index.ts`:

```ts
/**
 * @bdas/profile — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, services) are private.
 */
export { getProfile, saveProfile, canViewProfile, type Db } from "./services/profile";
export {
  ABSCHLUSSART_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  UNIVERSITIES,
  SONSTIGE,
  isKnownUniversity,
} from "./data";
export { SaveProfileFields } from "./types";
export type { MemberProfile, SaveProfileInput, ProfileActor } from "./types";
export type { ProfileEvent, ProfileCompleted, ProfileUpdated } from "./events";
```

- [ ] **Step 4: Write the export-surface guard test**

`modules/profile/src/index.export.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as surface from "./index";

describe("@bdas/profile public surface", () => {
  it("exports exactly the intended runtime symbols", () => {
    expect(Object.keys(surface).sort()).toEqual(
      [
        "ABSCHLUSSART_OPTIONS",
        "GEFUNDEN_DURCH_OPTIONS",
        "SONSTIGE",
        "SaveProfileFields",
        "UNIVERSITIES",
        "canViewProfile",
        "getProfile",
        "isKnownUniversity",
        "saveProfile",
      ].sort(),
    );
  });
});
```

- [ ] **Step 5: Write the integration tests (fail first)**

`modules/profile/src/index.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import { getProfile, saveProfile } from "./services/profile";
import { dbReachable, setupProfileDb } from "./test-db";
import type { ProfileActor } from "./types";

const describeIfDb = (await dbReachable()) ? describe : describe.skip;

const OWNER: ProfileActor = { userId: "usr_owner", grants: [{ role: "member", groupId: null }] };
const OTHER: ProfileActor = { userId: "usr_other", grants: [{ role: "member", groupId: null }] };

const FIELDS = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
};

function capture(): AnyEvent[] {
  const seen: AnyEvent[] = [];
  getEventBus().subscribe("profile.completed", async (e) => void seen.push(e));
  getEventBus().subscribe("profile.updated", async (e) => void seen.push(e));
  return seen;
}

describeIfDb("profile service", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupProfileDb();
    resetEventBus();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("create → get roundtrip", async () => {
    await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: FIELDS,
      actor: OWNER,
      groupId: "grp_1",
    });
    const p = await getProfile(t.db, OWNER.userId);
    expect(p?.studiengang).toBe("Informatik");
    expect(p?.completedAt).toBeInstanceOf(Date);
    expect(p?.updatedBy).toBe(OWNER.userId);
  });

  it("upsert overwrites and stamps completed_at only once", async () => {
    const seen = capture();
    const first = await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: FIELDS,
      actor: OWNER,
      groupId: "grp_1",
    });
    const second = await saveProfile(t.db, {
      userId: OWNER.userId,
      fields: { ...FIELDS, studiengang: "Mathematik" },
      actor: OWNER,
    });
    expect(second.studiengang).toBe("Mathematik");
    expect(second.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    expect(seen.map((e) => e.type)).toEqual(["profile.completed", "profile.updated"]);
    expect((seen[0] as { groupId: string }).groupId).toBe("grp_1");
  });

  it("rejects a non-owner write", async () => {
    await expect(
      saveProfile(t.db, { userId: OWNER.userId, fields: FIELDS, actor: OTHER }),
    ).rejects.toThrow(/eigenes Profil/);
  });

  it("rejects an invalid enum", async () => {
    await expect(
      saveProfile(t.db, {
        userId: OWNER.userId,
        fields: { ...FIELDS, abschlussart: "nope" },
        actor: OWNER,
      }),
    ).rejects.toThrow(/ungültig/i);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @bdas/profile test`
Expected: PASS (integration cases run against Docker Postgres; export + validation always run).

- [ ] **Step 7: Commit**

```bash
git add modules/profile/src/events.ts modules/profile/src/services modules/profile/src/index.ts modules/profile/src/index.test.ts modules/profile/src/index.export.test.ts
git commit -m "feat(profile): getProfile/saveProfile services, events, public surface"
```

---

### Task 4: Private `profile-media` storage accessor

**Files:**

- Modify: `core/storage/src/index.ts` (add `getProfileMediaStorage()`)
- Test: `core/storage/src/profile-media.test.ts`

**Interfaces:**

- Produces: `getProfileMediaStorage(): SupabaseStorageClient` — a **private** bucket client (env `SUPABASE_PROFILE_MEDIA_BUCKET`, default `profile-media`). No public-URL helper (private ⇒ signed downloads only), unlike the content/event/blog accessors.

- [ ] **Step 1: Write the failing test**

`core/storage/src/profile-media.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { getProfileMediaStorage } from "./index";
import { SupabaseStorageClient } from "./supabase";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("getProfileMediaStorage", () => {
  it("throws without SUPABASE_URL + service role key", () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    expect(() => getProfileMediaStorage()).toThrow(/profile-media/);
  });

  it("builds a Supabase client when configured", () => {
    process.env["SUPABASE_URL"] = "https://x.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    expect(getProfileMediaStorage()).toBeInstanceOf(SupabaseStorageClient);
  });
});
```

Run: `pnpm --filter @bdas/storage test -- profile-media` → FAIL (`getProfileMediaStorage` not exported).

- [ ] **Step 2: Implement the accessor**

In `core/storage/src/index.ts`, after the `getContentMediaStorage`/`contentMediaPublicUrl` block and before `export { SupabaseStorageClient };`, add:

```ts
let _profileMedia: SupabaseStorageClient | null = null;

/**
 * Storage client for the **private** `profile-media` bucket (member profile
 * photos). Unlike event/blog/content media there is deliberately no public-URL
 * helper: reads go through short-lived `signedDownloadUrl` only (spec §7,
 * personal data).
 */
export function getProfileMediaStorage(): SupabaseStorageClient {
  if (_profileMedia) return _profileMedia;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_PROFILE_MEDIA_BUCKET"] ?? "profile-media";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "profile-media storage is not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  _profileMedia = new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  return _profileMedia;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bdas/storage test -- profile-media`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add core/storage/src/index.ts core/storage/src/profile-media.test.ts
git commit -m "feat(storage): private profile-media bucket accessor"
```

> **Ops note (not a code step):** before enabling the flag in any environment, create the private `profile-media` bucket in Supabase and set `SUPABASE_PROFILE_MEDIA_BUCKET` if not the default. Capture this in the rollout checklist (Task 12 / spec §12).

---

### Task 5: Fix the registration name-drop — persist first/last name at sign-up

**Files:**

- Modify: `apps/web/app/registrieren/actions.ts`
- Test: `apps/web/app/registrieren/actions.test.ts`

**Interfaces:**

- Consumes: `register` (auth), `createProfile` (members) — existing.
- Produces: `registerAction` now persists `firstName`/`lastName` into a `members` row (status `pending`, no group) immediately after `register`, before sending the verify email. Validation errors for empty names surface as `state.fields`.

**Note on ordering & idempotency:** `register` creates the auth user; if `createProfile` then fails the account exists without a member row — acceptable orphan (spec §3.1), recoverable on next `/account` visit. Keep `createProfile` best-effort-logged like the email send is, so a member-row hiccup never blocks account creation.

- [ ] **Step 1: Write the failing test**

`apps/web/app/registrieren/actions.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: () => ({ get: () => undefined }) }));
const redirectMock = vi.fn(() => {
  throw new Error("REDIRECT");
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const registerMock = vi.fn();
const createProfileMock = vi.fn();
vi.mock("@bdas/auth", () => ({
  register: (...a: unknown[]) => registerMock(...a),
  buildVerifyUrl: () => "http://x/verify",
  getNotifier: () => ({ send: vi.fn() }),
}));
vi.mock("@bdas/members", () => ({
  createProfile: (...a: unknown[]) => createProfileMock(...a),
}));
vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));

import { registerAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("registerAction", () => {
  beforeEach(() => {
    process.env["BDAS_FLAG_AUTH"] = "true";
    registerMock.mockReset().mockResolvedValue({ userId: "usr_1", verifyToken: "tok" });
    createProfileMock.mockReset().mockResolvedValue({});
    redirectMock.mockClear();
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_AUTH"];
  });

  it("persists first/last name via createProfile after register", async () => {
    await expect(
      registerAction(
        {},
        form({
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@x.de",
          password: "correcthorse1",
          consent: "true",
        }),
      ),
    ).rejects.toThrow("REDIRECT");
    expect(createProfileMock).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("rejects an empty first name before touching auth", async () => {
    const state = await registerAction(
      {},
      form({ firstName: " ", lastName: "L", email: "a@x.de", password: "pw", consent: "true" }),
    );
    expect(state.fields?.["firstName"]).toBeTruthy();
    expect(registerMock).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm --filter @bdas/web test -- registrieren/actions` → FAIL.

- [ ] **Step 2: Implement the fix**

Edit `apps/web/app/registrieren/actions.ts`. Add the members import and name handling:

```ts
import { buildVerifyUrl, getNotifier, register } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError, ValidationError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { createProfile } from "@bdas/members";

import { bootAuth } from "../../lib/auth-bootstrap";
```

Inside `registerAction`, after reading `email`/`password`/`consent`, read and validate names before the `register` call:

```ts
const firstName = String(formData.get("firstName") ?? "").trim();
const lastName = String(formData.get("lastName") ?? "").trim();
const nameErrors: Record<string, string> = {};
if (!firstName) nameErrors["firstName"] = "Bitte gib deinen Vornamen an.";
if (!lastName) nameErrors["lastName"] = "Bitte gib deinen Nachnamen an.";
if (Object.keys(nameErrors).length > 0) {
  return { error: "Bitte fülle alle Pflichtfelder aus.", fields: nameErrors };
}
```

After the `register(...)` call succeeds (right after the `try/catch` that assigns `result`), persist the member row:

```ts
try {
  await createProfile(getDb(), {
    userId: result.userId,
    firstName,
    lastName,
  });
} catch (err) {
  // Account already exists; the /account profile form is the recovery path.
  // Never fail the response for a member-row hiccup — log and continue.
  console.error("[auth] createProfile after register failed:", err);
}
```

(The verify-email send and `redirect("/registrieren/erfolg")` stay as-is below.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bdas/web test -- registrieren/actions`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/registrieren/actions.ts apps/web/app/registrieren/actions.test.ts
git commit -m "fix(auth): persist first/last name at registration (name-drop bug)"
```

---

### Task 6: Profile photo upload route (`/api/profile/upload-url`)

**Files:**

- Create: `apps/web/app/api/profile/upload-url/route.ts`
- Test: `apps/web/app/api/profile/upload-url/route.test.ts`

**Interfaces:**

- Consumes: `isFlagOn`, `getCurrentMember` (members), `getProfileMediaStorage` (Task 4), `readSessionCookie`.
- Produces: `POST` returning `{ uploadUrl, storageKey }`. Gates: flag on (else 404), authenticated (else 401), own-photo-only (actor uploads under their own `userId` prefix). Mime allowlist `image/{jpeg,png,webp,avif}`, size ≤ 5 MB (else 422). Storage key `<userId>/<uuid>.<ext>`. **No `publicUrl`** in the response — private bucket.

- [ ] **Step 1: Write the failing gate test**

`apps/web/app/api/profile/upload-url/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://x/api/profile/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("profile upload-url gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_PROFILE"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_PROFILE"];
  });

  it("404s while the profile flag is off", async () => {
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(404);
  });

  it("401s for an anonymous request when the flag is on", async () => {
    process.env["BDAS_FLAG_PROFILE"] = "true";
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(401);
  });
});
```

Run: `pnpm --filter @bdas/web test -- api/profile/upload-url` → FAIL (route missing).

- [ ] **Step 2: Implement the route**

`apps/web/app/api/profile/upload-url/route.ts`:

```ts
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { getProfileMediaStorage } from "@bdas/storage";

import { readSessionCookie } from "../../../../lib/auth-cookie";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB cap for a profile photo
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function POST(req: Request) {
  if (!isFlagOn("profile")) return Response.json({ error: "Nicht verfügbar." }, { status: 404 });

  const session = readSessionCookie();
  if (!session) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });
  const me = await getCurrentMember(getDb(), session);
  if (!me) return Response.json({ error: "Anmeldung erforderlich." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
  } | null;
  if (!body?.mimeType || !ALLOWED.has(body.mimeType)) {
    return Response.json({ error: "Nur Bilddateien (JPG, PNG, WebP, AVIF)." }, { status: 422 });
  }
  if (!body.sizeBytes || body.sizeBytes <= 0 || body.sizeBytes > MAX_BYTES) {
    return Response.json({ error: "Datei zu groß (max. 5 MB)." }, { status: 422 });
  }

  const ext = (body.filename?.split(".").pop() ?? "img").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Own-photo-only: the key is always prefixed with the actor's own user id.
  const storageKey = `${me.user.id}/${crypto.randomUUID()}.${ext}`;
  const storage = getProfileMediaStorage();
  const signed = await storage.signedUploadUrl({
    storageKey,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
  });
  return Response.json({ uploadUrl: signed.url, storageKey });
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bdas/web test -- api/profile/upload-url`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/profile/upload-url/route.ts apps/web/app/api/profile/upload-url/route.test.ts
git commit -m "feat(profile): private photo upload-url route (own-photo-only, 5MB)"
```

---

### Task 7: Wizard step-validation (pure) + shared field option data

**Files:**

- Create: `apps/web/app/_profile/steps.ts`
- Test: `apps/web/app/_profile/steps.test.ts`

**Interfaces:**

- Consumes: `SaveProfileFields`, `isKnownUniversity`, `SONSTIGE` (from `@bdas/profile`).
- Produces:
  - `type WizardValues` — the flat client form state.
  - `WIZARD_STEPS: ReadonlyArray<{ id: string; label: string; fields: (keyof WizardValues)[] }>` (6 steps: `studium`, `uni_gruppe`, `geburtsdatum`, `gefunden`, `foto`, `review`).
  - `resolveUni(values): string` — returns the value stored in `uni` (`uniOther` when `uni === SONSTIGE`, else `uni`).
  - `validateStep(stepId: string, values: WizardValues): Record<string, string>` — field→error map for the fields owned by that step (empty ⇒ step passes). `foto` and `review` always pass (photo optional; review submits).

- [ ] **Step 1: Write failing tests**

`apps/web/app/_profile/steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { resolveUni, validateStep, type WizardValues } from "./steps";

const base: WizardValues = {
  studiengang: "Informatik",
  abschlussart: "bachelor",
  uni: "Universität zu Köln",
  uniOther: "",
  primaryGroupId: "grp_1",
  geburtsdatum: "2000-05-01",
  gefundenDurch: "webseite",
  empfehlerName: "",
  photoStorageKey: null,
};

describe("validateStep", () => {
  it("passes the studium step with valid input", () => {
    expect(validateStep("studium", base)).toEqual({});
  });

  it("blocks the studium step on empty studiengang", () => {
    expect(validateStep("studium", { ...base, studiengang: " " })).toHaveProperty("studiengang");
  });

  it("blocks uni_gruppe when no group is chosen", () => {
    expect(validateStep("uni_gruppe", { ...base, primaryGroupId: "" })).toHaveProperty(
      "primaryGroupId",
    );
  });

  it("blocks uni_gruppe when Sonstige is chosen but free text is empty", () => {
    expect(validateStep("uni_gruppe", { ...base, uni: "Sonstige", uniOther: "" })).toHaveProperty(
      "uni",
    );
  });

  it("blocks gefunden=empfehlung without a referrer name", () => {
    expect(validateStep("gefunden", { ...base, gefundenDurch: "empfehlung" })).toHaveProperty(
      "empfehlerName",
    );
  });

  it("photo and review steps always pass", () => {
    expect(validateStep("foto", { ...base, photoStorageKey: null })).toEqual({});
    expect(validateStep("review", base)).toEqual({});
  });
});

describe("resolveUni", () => {
  it("returns the free text when Sonstige is selected", () => {
    expect(resolveUni({ ...base, uni: "Sonstige", uniOther: "Hochschule X" })).toBe("Hochschule X");
  });
  it("returns the list value otherwise", () => {
    expect(resolveUni(base)).toBe("Universität zu Köln");
  });
});
```

Run: `pnpm --filter @bdas/web test -- _profile/steps` → FAIL.

- [ ] **Step 2: Implement the module**

`apps/web/app/_profile/steps.ts`:

```ts
import { SaveProfileFields, SONSTIGE } from "@bdas/profile";

export type WizardValues = {
  studiengang: string;
  abschlussart: string;
  uni: string; // a list value or the SONSTIGE sentinel
  uniOther: string; // free text when uni === SONSTIGE
  primaryGroupId: string;
  geburtsdatum: string; // yyyy-mm-dd
  gefundenDurch: string;
  empfehlerName: string;
  photoStorageKey: string | null;
};

export const WIZARD_STEPS = [
  { id: "studium", label: "Studium", fields: ["studiengang", "abschlussart"] },
  { id: "uni_gruppe", label: "Hochschule & Gruppe", fields: ["uni", "primaryGroupId"] },
  { id: "geburtsdatum", label: "Geburtsdatum", fields: ["geburtsdatum"] },
  { id: "gefunden", label: "Gefunden durch", fields: ["gefundenDurch", "empfehlerName"] },
  { id: "foto", label: "Profilbild", fields: [] },
  { id: "review", label: "Überprüfen", fields: [] },
] as const;

/** The value stored in `uni`: the free text for Sonstige, else the list value. */
export function resolveUni(v: WizardValues): string {
  return v.uni === SONSTIGE ? v.uniOther.trim() : v.uni;
}

/** Map the flat wizard state onto the module's field shape for validation. */
function toFields(v: WizardValues) {
  return {
    studiengang: v.studiengang,
    abschlussart: v.abschlussart,
    uni: resolveUni(v),
    geburtsdatum: v.geburtsdatum,
    gefundenDurch: v.gefundenDurch,
    empfehlerName: v.empfehlerName,
    photoStorageKey: v.photoStorageKey,
  };
}

const STEP_FIELDS: Record<string, ReadonlyArray<string>> = Object.fromEntries(
  WIZARD_STEPS.map((s) => [s.id, s.fields]),
);

/**
 * Validate only the fields a given step owns, reusing the module's zod schema
 * as the single source of truth. `primaryGroupId` is app-owned (members), not
 * in the schema, so it is checked separately.
 */
export function validateStep(stepId: string, v: WizardValues): Record<string, string> {
  const owned = STEP_FIELDS[stepId] ?? [];
  const errors: Record<string, string> = {};

  if (owned.includes("primaryGroupId") && v.primaryGroupId.trim() === "") {
    errors["primaryGroupId"] = "Bitte wähle deine BDAS-Gruppe.";
  }

  const schemaFields = owned.filter((f) => f !== "primaryGroupId");
  if (schemaFields.length > 0) {
    const res = SaveProfileFields.safeParse(toFields(v));
    if (!res.success) {
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (schemaFields.includes(key) && !errors[key]) errors[key] = issue.message;
      }
    }
  }
  return errors;
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @bdas/web test -- _profile/steps`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_profile/steps.ts apps/web/app/_profile/steps.test.ts
git commit -m "feat(profile): pure wizard step-validation"
```

---

### Task 8: Wizard route — flag helper, profile-complete gate, submit action, UI, verify redirect

**Files:**

- Create: `apps/web/app/_profile/flag.ts`
- Create: `apps/web/app/_profile/complete.ts`
- Create: `apps/web/app/profil/actions.ts`
- Create: `apps/web/app/profil/ProfileFields.tsx` (shared field building blocks)
- Create: `apps/web/app/profil/PhotoField.tsx`
- Create: `apps/web/app/profil/Wizard.tsx`
- Create: `apps/web/app/profil/page.tsx`
- Modify: `apps/web/app/verifizieren/[token]/page.tsx` (redirect into the wizard when incomplete)
- Test: `apps/web/app/_profile/complete.test.ts`

**Interfaces:**

- Consumes: `WIZARD_STEPS`, `WizardValues`, `validateStep`, `resolveUni` (Task 7); `getProfile`, `saveProfile`, option/university constants (Task 3); `getCurrentMember`, `changePrimaryGroup` (members); `listGroups` (groups).
- Produces:
  - `requireProfileFlag(): void` (calls `notFound()` when off).
  - `isProfileComplete(db, userId): Promise<boolean>` — true iff a profile row has `completedAt != null` AND the member's `primaryGroupId` is set.
  - `submitWizardAction(prev, formData): Promise<WizardActionState>` — sets the group (members) then `saveProfile` (profile), forwarding `groupId`; returns `{ ok: true }` on success (client redirects to `/account`) or `{ error, fields }`.

- [ ] **Step 1: Write the flag helper**

`apps/web/app/_profile/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

export function requireProfileFlag(): void {
  if (!isFlagOn("profile")) notFound();
}
```

- [ ] **Step 2: Write the profile-complete gate (with failing test)**

`apps/web/app/_profile/complete.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const getProfileMock = vi.fn();
const getMemberByUserIdMock = vi.fn();
vi.mock("@bdas/profile", () => ({ getProfile: (...a: unknown[]) => getProfileMock(...a) }));
vi.mock("@bdas/members", () => ({
  getMemberByUserId: (...a: unknown[]) => getMemberByUserIdMock(...a),
}));

import { isProfileComplete } from "./complete";

describe("isProfileComplete", () => {
  it("false when no profile row", async () => {
    getProfileMock.mockResolvedValue(null);
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({}, "usr_1")).toBe(false);
  });

  it("false when completedAt is null", async () => {
    getProfileMock.mockResolvedValue({ completedAt: null });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({}, "usr_1")).toBe(false);
  });

  it("false when the member has no primary group", async () => {
    getProfileMock.mockResolvedValue({ completedAt: new Date() });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: null });
    expect(await isProfileComplete({}, "usr_1")).toBe(false);
  });

  it("true when completed and grouped", async () => {
    getProfileMock.mockResolvedValue({ completedAt: new Date() });
    getMemberByUserIdMock.mockResolvedValue({ primaryGroupId: "grp_1" });
    expect(await isProfileComplete({}, "usr_1")).toBe(true);
  });
});
```

`apps/web/app/_profile/complete.ts`:

```ts
import type { Db } from "@bdas/db";
import { getMemberByUserId } from "@bdas/members";
import { getProfile } from "@bdas/profile";

/**
 * A profile is complete iff the module row is stamped (`completedAt != null`)
 * AND the member has a primary group (spec §3 "profile complete?" gate). The
 * two live in different modules; this app helper joins them by userId. `Db`
 * from @bdas/db is the same `PostgresJsDatabase<Record<string, never>>` both
 * modules accept, so no cast is needed (matches how getCurrentMember is called
 * with getDb() throughout the app).
 */
export async function isProfileComplete(db: Db, userId: string): Promise<boolean> {
  const [profile, member] = await Promise.all([
    getProfile(db, userId),
    getMemberByUserId(db, userId),
  ]);
  return profile?.completedAt != null && member?.primaryGroupId != null;
}
```

Run: `pnpm --filter @bdas/web test -- _profile/complete` → PASS.

- [ ] **Step 3: Write the submit action**

`apps/web/app/profil/actions.ts`:

```ts
"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { changePrimaryGroup, getCurrentMember } from "@bdas/members";
import { saveProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";

export type WizardActionState = {
  readonly ok?: boolean;
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function submitWizardAction(
  _prev: WizardActionState,
  formData: FormData,
): Promise<WizardActionState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  if (groupId === "")
    return { error: "Bitte wähle deine BDAS-Gruppe.", fields: { primaryGroupId: "Pflichtfeld." } };

  const fields = {
    studiengang: String(formData.get("studiengang") ?? "").trim(),
    abschlussart: String(formData.get("abschlussart") ?? ""),
    uni: String(formData.get("uni") ?? "").trim(),
    geburtsdatum: String(formData.get("geburtsdatum") ?? ""),
    gefundenDurch: String(formData.get("gefundenDurch") ?? ""),
    empfehlerName: String(formData.get("empfehlerName") ?? "").trim() || null,
    photoStorageKey: String(formData.get("photoStorageKey") ?? "").trim() || null,
  };

  try {
    // Group first (members owns it). A pending member's choice applies directly;
    // an active member's would file a transfer request — either way the value is
    // recorded before we stamp completion.
    await changePrimaryGroup(db, me.member.id, groupId, { userId: me.user.id, grants: me.grants });
    await saveProfile(db, {
      userId: me.user.id,
      fields,
      actor: { userId: me.user.id, grants: me.grants },
      groupId,
    });
    return { ok: true };
  } catch (err) {
    if (isAppError(err)) {
      const f = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return f ? { error: err.message, fields: f } : { error: err.message };
    }
    throw err;
  }
}
```

- [ ] **Step 4: Write the shared field components**

`apps/web/app/profil/ProfileFields.tsx` — client building blocks reused by the wizard and the account edit form. Uses design-system primitives + the native-select class (copied from `ProfileForm.tsx`; extract as `SELECT_CLASS`). Renders labelled `<Field>`s for studiengang, abschlussart (`<select>` from `ABSCHLUSSART_OPTIONS`), uni (`<select>` from `UNIVERSITIES` + `SONSTIGE`, revealing a free-text `<Input>` when Sonstige), group (`<select>` from passed `groups`), geburtsdatum (`<Input type="date">`), gefundenDurch (`<select>` from `GEFUNDEN_DURCH_OPTIONS`, revealing empfehlerName `<Input>` when `empfehlung`). Each field takes `value`, `onChange`, and `error?`. No inline hex/radius — only tokens + `SELECT_CLASS`.

```tsx
"use client";

import { Field, Input } from "@bdas/design-system";
import {
  ABSCHLUSSART_OPTIONS,
  GEFUNDEN_DURCH_OPTIONS,
  SONSTIGE,
  UNIVERSITIES,
} from "@bdas/profile";

import type { WizardValues } from "../_profile/steps";
import { PhotoField } from "./PhotoField";

export const SELECT_CLASS =
  "block w-full rounded-bdas border border-bdas-soft bg-bdas-surface px-3 py-2.5 text-base text-bdas-ink transition-colors duration-bdas-quick ease-bdas focus:border-bdas-red focus:outline-none focus:ring-2 focus:ring-bdas-red/20";

type Groups = ReadonlyArray<{ id: string; name: string; city: string }>;
type Setter = <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void;

export function StudiumFields({
  values,
  set,
  errors,
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field
        label="Studiengang"
        htmlFor="studiengang"
        {...(errors["studiengang"] ? { error: errors["studiengang"] } : {})}
      >
        <Input
          id="studiengang"
          value={values.studiengang}
          onChange={(e) => set("studiengang", e.currentTarget.value)}
          required
        />
      </Field>
      <Field
        label="Abschlussart"
        htmlFor="abschlussart"
        {...(errors["abschlussart"] ? { error: errors["abschlussart"] } : {})}
      >
        <select
          id="abschlussart"
          className={SELECT_CLASS}
          value={values.abschlussart}
          onChange={(e) => set("abschlussart", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {ABSCHLUSSART_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function UniGruppeFields({
  values,
  set,
  errors,
  groups,
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
  groups: Groups;
}) {
  return (
    <>
      <Field label="Hochschule" htmlFor="uni" {...(errors["uni"] ? { error: errors["uni"] } : {})}>
        <select
          id="uni"
          className={SELECT_CLASS}
          value={values.uni}
          onChange={(e) => set("uni", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {UNIVERSITIES.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value={SONSTIGE}>Sonstige …</option>
        </select>
        {values.uni === SONSTIGE ? (
          <Input
            aria-label="Andere Hochschule"
            placeholder="Name deiner Hochschule"
            className="mt-2"
            value={values.uniOther}
            onChange={(e) => set("uniOther", e.currentTarget.value)}
          />
        ) : null}
      </Field>
      <Field
        label="BDAS-Gruppe"
        htmlFor="primaryGroupId"
        {...(errors["primaryGroupId"] ? { error: errors["primaryGroupId"] } : {})}
      >
        <select
          id="primaryGroupId"
          className={SELECT_CLASS}
          value={values.primaryGroupId}
          onChange={(e) => set("primaryGroupId", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.city})
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

export function GeburtsdatumField({
  values,
  set,
  errors,
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <Field
      label="Geburtsdatum"
      htmlFor="geburtsdatum"
      {...(errors["geburtsdatum"] ? { error: errors["geburtsdatum"] } : {})}
    >
      <Input
        id="geburtsdatum"
        type="date"
        value={values.geburtsdatum}
        onChange={(e) => set("geburtsdatum", e.currentTarget.value)}
        required
      />
    </Field>
  );
}

export function GefundenFields({
  values,
  set,
  errors,
}: {
  values: WizardValues;
  set: Setter;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field
        label="Wie hast du BDAS gefunden?"
        htmlFor="gefundenDurch"
        {...(errors["gefundenDurch"] ? { error: errors["gefundenDurch"] } : {})}
      >
        <select
          id="gefundenDurch"
          className={SELECT_CLASS}
          value={values.gefundenDurch}
          onChange={(e) => set("gefundenDurch", e.currentTarget.value)}
        >
          <option value="">— bitte wählen —</option>
          {GEFUNDEN_DURCH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {values.gefundenDurch === "empfehlung" ? (
        <Field
          label="Von wem wurdest du empfohlen?"
          htmlFor="empfehlerName"
          {...(errors["empfehlerName"] ? { error: errors["empfehlerName"] } : {})}
        >
          <Input
            id="empfehlerName"
            value={values.empfehlerName}
            onChange={(e) => set("empfehlerName", e.currentTarget.value)}
          />
        </Field>
      ) : null}
    </>
  );
}

export function FotoStep({ values, set }: { values: WizardValues; set: Setter }) {
  return (
    <PhotoField
      storageKey={values.photoStorageKey}
      onChange={(key) => set("photoStorageKey", key)}
    />
  );
}
```

- [ ] **Step 5: Write the photo field**

`apps/web/app/profil/PhotoField.tsx` — mirrors `apps/web/app/_content/FotoField.tsx` but posts to `/api/profile/upload-url`, stores the returned **storageKey** (not a public URL), and previews via a signed URL fetched from a tiny helper endpoint or a passed-in preview URL. Since the bucket is private, the preview uses an `<img>` only when a freshly-minted signed URL is available; on first upload show a "Bild hochgeladen ✓" confirmation instead of a raw key.

```tsx
"use client";

import { useRef, useState } from "react";

/** Uploads a profile photo via /api/profile/upload-url (private bucket, signed
 *  PUT) and stores the returned storage key. Preview is a lightweight
 *  confirmation — private objects have no public URL. */
export function PhotoField({
  storageKey,
  onChange,
}: {
  storageKey: string | null;
  onChange: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Upload fehlgeschlagen.");
        return;
      }
      const { uploadUrl, storageKey: key } = (await res.json()) as {
        uploadUrl: string;
        storageKey: string;
      };
      const put = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!put.ok) {
        setError("Upload fehlgeschlagen.");
        return;
      }
      onChange(key);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {storageKey ? <p className="text-sm text-bdas-ink-body">Profilbild hochgeladen ✓</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-bdas-sm border border-bdas-strong px-3 py-1.5 text-sm text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-surface-hover disabled:opacity-50"
      >
        {busy ? "Lädt hoch…" : storageKey ? "Foto ersetzen" : "Foto hochladen (optional)"}
      </button>
      {error ? <p className="text-sm text-bdas-red">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 6: Write the wizard shell**

`apps/web/app/profil/Wizard.tsx` — client component holding `WizardValues` state, current step index, a token-built progress indicator (steps from `WIZARD_STEPS`), Weiter/Zurück buttons calling `validateStep` before advancing, and a final hidden-input `<form action={submitWizardAction}>` on the review step that serializes all values (using `resolveUni` for `uni`). On `state.ok` it `router.push("/account")`. Renders the step components from `ProfileFields.tsx`. Brand red only for the active step/accent (tokens). Accepts `groups` as a prop.

Key wiring (abbreviated to the load-bearing parts; the rest is straightforward step switching):

```tsx
"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Form } from "@bdas/design-system";

import { validateStep, resolveUni, WIZARD_STEPS, type WizardValues } from "../_profile/steps";
import { submitWizardAction, type WizardActionState } from "./actions";
import {
  StudiumFields,
  UniGruppeFields,
  GeburtsdatumField,
  GefundenFields,
  FotoStep,
} from "./ProfileFields";

const EMPTY: WizardValues = {
  studiengang: "",
  abschlussart: "",
  uni: "",
  uniOther: "",
  primaryGroupId: "",
  geburtsdatum: "",
  gefundenDurch: "",
  empfehlerName: "",
  photoStorageKey: null,
};

export function Wizard({
  groups,
}: {
  groups: ReadonlyArray<{ id: string; name: string; city: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<WizardValues>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, action] = useFormState<WizardActionState, FormData>(submitWizardAction, {});

  if (state.ok) router.push("/account");

  const set: <K extends keyof WizardValues>(k: K, v: WizardValues[K]) => void = (k, v) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const current = WIZARD_STEPS[step];
  const isReview = current.id === "review";

  function next() {
    const errs = validateStep(current.id, values);
    setErrors(errs);
    if (Object.keys(errs).length === 0) setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      {/* progress: WIZARD_STEPS, active pill in brand red (tokens) */}
      <ol className="flex flex-wrap gap-2 text-sm">
        {WIZARD_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={
              i === step
                ? "rounded-bdas-sm bg-bdas-red px-2 py-1 text-white"
                : "rounded-bdas-sm px-2 py-1 text-bdas-ink-muted"
            }
          >
            {s.label}
          </li>
        ))}
      </ol>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {current.id === "studium" && <StudiumFields values={values} set={set} errors={errors} />}
      {current.id === "uni_gruppe" && (
        <UniGruppeFields values={values} set={set} errors={errors} groups={groups} />
      )}
      {current.id === "geburtsdatum" && (
        <GeburtsdatumField values={values} set={set} errors={errors} />
      )}
      {current.id === "gefunden" && <GefundenFields values={values} set={set} errors={errors} />}
      {current.id === "foto" && <FotoStep values={values} set={set} />}
      {isReview && <ReviewSummary values={values} groups={groups} />}

      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Zurück
        </Button>
        {isReview ? (
          <Form action={action}>
            <input type="hidden" name="studiengang" value={values.studiengang} />
            <input type="hidden" name="abschlussart" value={values.abschlussart} />
            <input type="hidden" name="uni" value={resolveUni(values)} />
            <input type="hidden" name="primaryGroupId" value={values.primaryGroupId} />
            <input type="hidden" name="geburtsdatum" value={values.geburtsdatum} />
            <input type="hidden" name="gefundenDurch" value={values.gefundenDurch} />
            <input type="hidden" name="empfehlerName" value={values.empfehlerName} />
            <input type="hidden" name="photoStorageKey" value={values.photoStorageKey ?? ""} />
            <Button type="submit">Absenden</Button>
          </Form>
        ) : (
          <Button onClick={next}>Weiter</Button>
        )}
      </div>
    </Card>
  );
}

function ReviewSummary({
  values,
  groups,
}: {
  values: WizardValues;
  groups: ReadonlyArray<{ id: string; name: string }>;
}) {
  const group = groups.find((g) => g.id === values.primaryGroupId)?.name ?? "—";
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm text-bdas-ink-body">
      <dt>Studiengang</dt>
      <dd>{values.studiengang}</dd>
      <dt>Hochschule</dt>
      <dd>{resolveUni(values)}</dd>
      <dt>Gruppe</dt>
      <dd>{group}</dd>
      <dt>Geburtsdatum</dt>
      <dd>{values.geburtsdatum}</dd>
    </dl>
  );
}
```

- [ ] **Step 7: Write the wizard page**

`apps/web/app/profil/page.tsx` — server component: `requireAuthFlag()`, `requireProfileFlag()`; load `me` via session; redirect anonymous → `/anmelden`; if the profile is already complete (`isProfileComplete`), redirect → `/account`; load active groups; render `<Wizard groups={...} />`.

```tsx
import { redirect } from "next/navigation";

import { getDb } from "@bdas/db";
import { listGroups } from "@bdas/groups";
import { getCurrentMember } from "@bdas/members";

import { requireAuthFlag } from "../_auth/flag";
import { requireProfileFlag } from "../_profile/flag";
import { isProfileComplete } from "../_profile/complete";
import { readSessionCookie } from "../../lib/auth-cookie";
import { Wizard } from "./Wizard";

export const metadata = { title: "Profil vervollständigen" };

export default async function ProfilPage() {
  requireAuthFlag();
  requireProfileFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");
  if (await isProfileComplete(db, me.user.id)) redirect("/account");

  const groups = await listGroups(db, { status: "active" });
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Profil vervollständigen</h1>
        <p className="text-bdas-ink-body">
          Nur noch ein paar Angaben, dann geht deine Bewerbung an deinen lokalen Vorstand.
        </p>
      </header>
      <Wizard groups={groups.map((g) => ({ id: g.id, name: g.name, city: g.city }))} />
    </main>
  );
}
```

- [ ] **Step 8: Redirect verification into the wizard**

In `apps/web/app/verifizieren/[token]/page.tsx`, after a successful (non-error) verification, when the `profile` flag is on route the just-verified user into the wizard. Add near the top imports `import { redirect } from "next/navigation";` and `import { isFlagOn } from "@bdas/feature-flags";`. After the `verifyEmail` try/catch, before rendering:

```tsx
if (result && !result.alreadyVerified && isFlagOn("profile")) {
  redirect("/profil");
}
```

(Leave the static success page for `alreadyVerified` and the flag-off case unchanged.)

- [ ] **Step 9: Route incomplete profiles to the wizard on sign-in**

Spec §3: "On sign-in, an incomplete profile routes the user to the wizard." In `apps/web/app/anmelden/actions.ts`, replace the unconditional `redirect("/account")` at the end of `loginAction` with a completeness check. Add imports:

```ts
import { isFlagOn } from "@bdas/feature-flags";
import { isProfileComplete } from "../_profile/complete";
```

Then, after `setSessionCookie(result.token);`:

```ts
// Guide members who verified but never finished onboarding straight into the
// wizard; everyone else lands on their account.
if (isFlagOn("profile") && !(await isProfileComplete(getDb(), result.userId))) {
  redirect("/profil");
}
redirect("/account");
```

(If `login`'s result does not expose `userId`, resolve it via `getCurrentUser(getDb(), result.token)` or the session helper — confirm the `LoginResult` shape in `modules/auth/src/services/login.ts` before wiring; use whichever field carries the authenticated user id.)

- [ ] **Step 10: Run tests + typecheck**

Run: `pnpm --filter @bdas/web test -- _profile && pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/_profile apps/web/app/profil apps/web/app/verifizieren/[token]/page.tsx apps/web/app/anmelden/actions.ts
git commit -m "feat(profile): onboarding wizard, verify + sign-in routing, complete gate"
```

---

### Task 9: Account edit (#96) — reuse the profile fields on "Mein Konto"

**Files:**

- Create: `apps/web/app/account/EditProfileForm.tsx` (single-page, non-stepped)
- Create: `apps/web/app/account/profile-actions.ts` (`saveProfileFieldsAction`)
- Modify: `apps/web/app/account/page.tsx` (render the extended edit form when the flag is on)

**Interfaces:**

- Consumes: the `ProfileFields.tsx` building blocks (Task 8), `saveProfile`/`getProfile` (profile), `getCurrentMember`/`changePrimaryGroup` (members).
- Produces: `saveProfileFieldsAction(prev, formData)` — same write path as the wizard submit (group via members, fields via `saveProfile`), but returns a stay-on-page success notice instead of redirecting. Prefills from the existing `getProfile` row + `me.member.primaryGroupId`.

- [ ] **Step 1: Write the account save action**

`apps/web/app/account/profile-actions.ts` — identical orchestration to `submitWizardAction` (Task 8 Step 3) but returns `{ notice: "Profil gespeichert." }` on success and `revalidatePath("/account")`. Repeat the full body (do not "see Task 8"):

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { changePrimaryGroup, getCurrentMember } from "@bdas/members";
import { saveProfile } from "@bdas/profile";

import { readSessionCookie } from "../../lib/auth-cookie";

export type EditProfileState = {
  readonly notice?: string;
  readonly error?: string;
  readonly fields?: Record<string, string>;
};

export async function saveProfileFieldsAction(
  _prev: EditProfileState,
  formData: FormData,
): Promise<EditProfileState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const groupId = String(formData.get("primaryGroupId") ?? "").trim();
  const fields = {
    studiengang: String(formData.get("studiengang") ?? "").trim(),
    abschlussart: String(formData.get("abschlussart") ?? ""),
    uni: String(formData.get("uni") ?? "").trim(),
    geburtsdatum: String(formData.get("geburtsdatum") ?? ""),
    gefundenDurch: String(formData.get("gefundenDurch") ?? ""),
    empfehlerName: String(formData.get("empfehlerName") ?? "").trim() || null,
    photoStorageKey: String(formData.get("photoStorageKey") ?? "").trim() || null,
  };

  try {
    if (groupId !== "") {
      await changePrimaryGroup(db, me.member.id, groupId, {
        userId: me.user.id,
        grants: me.grants,
      });
    }
    await saveProfile(db, {
      userId: me.user.id,
      fields,
      actor: { userId: me.user.id, grants: me.grants },
      groupId: groupId || (me.member.primaryGroupId ?? null),
    });
    revalidatePath("/account");
    return { notice: "Profil gespeichert." };
  } catch (err) {
    if (isAppError(err)) {
      const f = "fields" in err && (err as { fields?: Record<string, string> }).fields;
      return f ? { error: err.message, fields: f } : { error: err.message };
    }
    throw err;
  }
}
```

- [ ] **Step 2: Write the single-page edit form**

`apps/web/app/account/EditProfileForm.tsx` — a `"use client"` component that holds `WizardValues` initialized from props (mapping a stored `uni` to either a list selection or `SONSTIGE` + `uniOther` via `isKnownUniversity`), renders **all** field groups from `ProfileFields.tsx` stacked (no steps), and submits every value through hidden inputs to `saveProfileFieldsAction`, showing `state.notice`/`state.error`. Uses `useFormState`.

- [ ] **Step 3: Wire it into the account page**

In `apps/web/app/account/page.tsx`, when `isFlagOn("profile")`, load the profile row (`getProfile(db, me.user.id)`) and render `<EditProfileForm ... />` inside the existing profile Card in place of (or below) the names-only `ProfileForm`. When the flag is off, the page is unchanged. Add imports for `isFlagOn`, `getProfile`, and `EditProfileForm`.

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm --filter @bdas/web typecheck && pnpm --filter @bdas/web test -- account`
Expected: PASS (existing account tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account/EditProfileForm.tsx apps/web/app/account/profile-actions.ts apps/web/app/account/page.tsx
git commit -m "feat(profile): edit extended profile on Mein Konto (#96)"
```

---

### Task 10: Board notification on `profile.completed`

**Files:**

- Create: `modules/members/src/services/board-recipients.ts`
- Modify: `modules/members/src/index.ts` (export `listBoardRecipientsForGroup`)
- Modify: `modules/notifications/src/types.ts` (add `member_application_received` to the template union + any needed `TemplateData` fields)
- Modify: `modules/notifications/src/templates.ts` (render the new template)
- Modify: `modules/notifications/src/subscribers.ts` (subscribe to `profile.completed`)
- Modify: `modules/notifications/package.json` (add `@bdas/profile` dep) and `modules/notifications/tsconfig.json` if it lists references
- Test: `modules/members/src/board-recipients.test.ts`
- Test: `modules/notifications/src/subscribers.profile.test.ts`

**Interfaces:**

- Consumes: `ProfileCompleted` (from `@bdas/profile`), `sendTransactional` (internal), `memberRoleGrants`/`members` (members schema).
- Produces:
  - `listBoardRecipientsForGroup(db, groupId: string | null): Promise<string[]>` — member ids of active `local_board` + `local_board_lead` grants scoped to `groupId`; when none (or `groupId` null), falls back to active `federal_board` member ids.
  - notifications subscriber: on `profile.completed`, resolves recipients for `e.groupId` and `sendTransactional(db, "member_application_received", memberId, { applicantName?, groupName? })` for each.

- [ ] **Step 1: Write the recipients resolver (failing test)**

`modules/members/src/board-recipients.test.ts` — uses the members test-db harness; seed: a group-scoped `local_board` grant and a `federal_board` grant; assert `listBoardRecipientsForGroup(db, groupId)` returns the local board member id, and with an unknown group returns the federal board member id (fallback).

`modules/members/src/services/board-recipients.ts`:

```ts
import { and, eq, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { memberRoleGrants } from "../schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

/**
 * Member ids that should be notified of a new application in `groupId`:
 * the group's active local board (lead + members). Falls back to the federal
 * board when the group has no local board (spec §8). Deduplicated.
 */
export async function listBoardRecipientsForGroup(
  db: Db,
  groupId: string | null,
): Promise<string[]> {
  if (groupId) {
    const local = await db
      .select({ memberId: memberRoleGrants.memberId })
      .from(memberRoleGrants)
      .where(
        and(
          eq(memberRoleGrants.groupId, groupId),
          isNull(memberRoleGrants.revokedAt),
          or(
            eq(memberRoleGrants.role, "local_board"),
            eq(memberRoleGrants.role, "local_board_lead"),
          ),
        ),
      );
    const ids = [...new Set(local.map((r) => r.memberId))];
    if (ids.length > 0) return ids;
  }

  const federal = await db
    .select({ memberId: memberRoleGrants.memberId })
    .from(memberRoleGrants)
    .where(and(eq(memberRoleGrants.role, "federal_board"), isNull(memberRoleGrants.revokedAt)));
  return [...new Set(federal.map((r) => r.memberId))];
}
```

Add to `modules/members/src/index.ts`:

```ts
export { listBoardRecipientsForGroup } from "./services/board-recipients";
```

Run: `pnpm --filter @bdas/members test -- board-recipients` → PASS.

- [ ] **Step 2: Add the notification template**

In `modules/notifications/src/types.ts`, add `"member_application_received"` to the `TransactionalTemplate` union, and add optional `applicantName?: string` and `groupName?: string` to `TemplateData` (if not already present — `groupName` likely exists for organizer templates; reuse it).

In `modules/notifications/src/templates.ts`, add a `case "member_application_received":` returning a German "neue Bewerbung zur Prüfung" body, e.g.:

```ts
    case "member_application_received":
      return body(
        "BDAS — Neue Bewerbung zur Prüfung",
        firstName,
        `es liegt eine neue Mitgliedsbewerbung${data.applicantName ? ` von ${data.applicantName}` : ""}${
          data.groupName ? ` für ${data.groupName}` : ""
        } vor. Bitte prüfe sie im Vorstandsbereich.`,
      );
```

- [ ] **Step 3: Subscribe to `profile.completed`**

In `modules/notifications/src/subscribers.ts`, import the event type and the resolver, and add a subscription inside `registerNotificationSubscribers` (wrapped in `safe`, like the others):

```ts
import type { ProfileCompleted } from "@bdas/profile";
import { getMemberByUserId, listBoardRecipientsForGroup } from "@bdas/members";
```

```ts
    getEventBus().subscribe<ProfileCompleted>(
      "profile.completed",
      safe<ProfileCompleted>(async (e) => {
        const applicant = await getMemberByUserId(db, e.userId);
        const recipients = await listBoardRecipientsForGroup(db, e.groupId);
        for (const memberId of recipients) {
          await sendTransactional(db, "member_application_received", memberId, {
            applicantName: applicant ? `${applicant.firstName} ${applicant.lastName}` : undefined,
          });
        }
      }),
    ),
```

Add `"@bdas/profile": "workspace:*"` and `"@bdas/members": "workspace:*"` (if not present) to `modules/notifications/package.json` dependencies.

- [ ] **Step 4: Write the subscriber test**

`modules/notifications/src/subscribers.profile.test.ts` — with the notifier stubbed to capture sends, publish a `profile.completed` event and assert the captured template is `member_application_received` and the recipient count matches the seeded board. Follow the existing notifications subscriber test setup (stub `setNotifier`, `setRecipientResolver`, seed via members test-db).

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @bdas/notifications test && pnpm --filter @bdas/members test -- board-recipients`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add modules/members/src/services/board-recipients.ts modules/members/src/index.ts modules/members/src/board-recipients.test.ts modules/notifications
git commit -m "feat(notifications): notify the local board on profile.completed"
```

---

### Task 11: Board pending list shows the application; datenexport includes profile

**Files:**

- Modify: `apps/web/app/admin/pending-members/page.tsx` (show profile fields + referrer + signed photo per applicant)
- Create: `apps/web/app/admin/pending-members/ApplicantPhoto.tsx` (optional, if a client preview of the signed URL is needed)
- Modify: `apps/web/app/account/datenexport/route.ts` (include the profile row)

**Interfaces:**

- Consumes: `getProfile` (profile), `getProfileMediaStorage` + `signedDownloadUrl`, `canViewProfile`.
- Produces: the pending-members page renders each applicant's studiengang / abschlussart / uni / geburtsdatum / gefunden_durch / **empfehler_name**, and — when a photo exists — an `<img>` from a short-lived signed download URL minted server-side. Datenexport payload gains a `profileData` field.

- [ ] **Step 1: Extend the pending-members page**

In `apps/web/app/admin/pending-members/page.tsx`, after computing `pending`, when `isFlagOn("profile")` fetch each applicant's profile in parallel (`Promise.all(pending.map((m) => getProfile(db, m.userId)))`) and, for those with a `photoStorageKey`, mint a signed URL via `getProfileMediaStorage().signedDownloadUrl({ storageKey, ttlSeconds: 300 })`. Render the extra fields (labels in German) and the referrer name inside each applicant's Card. Guard all of it behind the flag so the page is unchanged when off. Read authz is already satisfied — the page is board-gated — but the fields are only shown to a board viewer (spec §10, "owner or any board grant").

- [ ] **Step 2: Extend the data export**

In `apps/web/app/account/datenexport/route.ts`, when `isFlagOn("profile")` add the caller's profile row to the payload (subject-access completeness, spec §10):

```ts
import { isFlagOn } from "@bdas/feature-flags";
import { getProfile } from "@bdas/profile";
```

```ts
  const profileData = isFlagOn("profile") ? await getProfile(db, me.user.id) : null;
  // ...
  const payload = {
    exportedAt: new Date().toISOString(),
    notice: /* unchanged */,
    account,
    profile: me.member,
    profileData,
    roleGrants: me.grants,
  };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/pending-members/page.tsx apps/web/app/account/datenexport/route.ts
git commit -m "feat(profile): board sees applications; datenexport includes profile"
```

---

### Task 12: End-to-end coverage + module README + rollout checklist

**Files:**

- Create: `e2e/profile-onboarding.e2e.ts` (Playwright — testDir is `./e2e`, testMatch `**/*.e2e.ts`)
- Modify: `modules/profile/README.md` (already created — confirm it documents the surface + events)
- Create: `docs/decisions/00XX-profile-module.md` (ADR — new module + private bucket decision; number it next in sequence)

**Interfaces:**

- Consumes: the whole feature.
- Produces: an e2e spec exercising register → verify → wizard → submit → board pending list shows the applicant with referrer name; edit in Mein Konto persists; profile-incomplete sign-in routes to the wizard; wizard/API 404 for anonymous when the flag is off.

- [ ] **Step 1: Write the ADR**

`docs/decisions/00XX-profile-module.md` — record: new `modules/profile` owning `member_profiles` keyed by `user_id`; registration name-drop fix; referral as signal-only; private `profile-media` bucket with signed downloads; `profile.completed` → board notification. Reference the design spec.

- [ ] **Step 2: Write the Playwright spec**

`e2e/profile-onboarding.e2e.ts` — mirror an existing spec such as `e2e/auth.e2e.ts` / `e2e/resend-verification.e2e.ts` for the harness/fixtures (`e2e/helpers`). Cover: register → verify → wizard → submit → board pending list shows the applicant with referrer name; edit in Mein Konto persists; profile-incomplete sign-in routes to `/profil`; `/profil` and `/api/profile/upload-url` 404 for anonymous when the flag is off. Gate the run behind `BDAS_FLAG_PROFILE=true` in the test environment.

- [ ] **Step 3: Run the full module + web suites**

Run:

```bash
pnpm --filter @bdas/profile test
pnpm --filter @bdas/web test
pnpm -w typecheck
```

Expected: PASS. (Run the e2e suite per the repo's e2e command with `BDAS_FLAG_PROFILE=true`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/profile-onboarding.spec.ts docs/decisions/00XX-profile-module.md modules/profile/README.md
git commit -m "test(profile): e2e onboarding; ADR for the profile module"
```

---

## Rollout (post-merge, spec §12)

1. Merge behind `profile` flag (off in production). Run `/security-review` — auth-adjacent + upload + personal data (birth date, photo).
2. Create the private `profile-media` bucket in Supabase; set `SUPABASE_PROFILE_MEDIA_BUCKET` if not default.
3. Enable in preview; walk register → verify → wizard → submit → board approval end-to-end.
4. Enable in production; wizard, board notification, and the extended account edit go live.
