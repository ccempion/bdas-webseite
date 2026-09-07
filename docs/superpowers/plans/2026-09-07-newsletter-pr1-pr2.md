# Newsletter-Modul — Implementierungsplan PR 1 + PR 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eigenständiges Modul `modules/newsletter`, das Newsletter-Einwilligungen rechtssicher sammelt und protokolliert (PR 1), plus alle Erfassungspunkte für eingeloggte Nutzer und die Registrierung (PR 2). Es wird kein Newsletter versendet.

**Architecture:** Neues Modul nach den Acht Regeln (CLAUDE.md §1): vier eigene Tabellen, eigene Migrationen, auth-agnostische Services, öffentliche Oberfläche ausschließlich über `src/index.ts`. Das Modul versendet keine E-Mail und importiert weder Resend noch `modules/notifications` — es veröffentlicht typisierte Ereignisse auf `core/events`, den Versand baut PR 3. Die aktuelle Kontoadresse eines Abonnenten mit `user_id` wird nicht gespeichert, sondern über eine zur Kompositionszeit verdrahtete `AccountEmailResolver`-Schnittstelle aufgelöst (Muster: `RecipientResolver` in `modules/notifications`), damit das Modul `modules/members` nicht importiert.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components + Server Actions), Drizzle ORM auf PostgreSQL, `postgres`-js, vitest (Integrationstests gegen Docker-Postgres, keine DB-Mocks), Playwright für E2E, Tailwind + `@bdas/design-system`.

**Spec:** `docs/superpowers/specs/2026-09-06-newsletter-modul-design.md` (Branch `docs/newsletter-modul-spec`). Der Plan argumentiert aus der Spec; beide zusammen lesen.

## Global Constraints

- **Feature-Flag:** `newsletter`. In Produktion aus, bis das Modul abnahmefertig ist. Jede Route und jeder Boot-Pfad prüft das Flag (CLAUDE.md §3 Regel 6).
- **Regel 1 (Tabellenbesitz):** Nur `modules/newsletter` liest oder schreibt `newsletter_*`. Die App-Schicht ruft ausschließlich Services aus `@bdas/newsletter`.
- **Regel 8 (öffentliche Oberfläche):** Nur `src/index.ts` re-exportiert. `schema.ts`, `test-db.ts`, `consent-log.ts`, `rate-limit.ts`, `tokens.ts` bleiben privat.
- **Kein E-Mail-Versand im Modul.** Kein Import von `@bdas/notifications`, kein Resend. Nur Ereignisse auf `@bdas/events`.
- **Sprache:** Alle nutzersichtbaren Texte auf Deutsch, Duzen, Tonalität F2 („einladend, wir"). Kommentare und Bezeichner im Code auf Englisch, außer wo die Umgebung schon Deutsch verwendet.
- **Design-Token (CLAUDE.md §7):** Kein inline-Hex, kein inline-Radius, kein inline-Schatten, keine inline-Dauer. Fehlt ein Wert, wird er in `core/design-system/src/tokens.ts` ergänzt **und** in `core/design-system/README.md` angemeldet.
- **`email` immer normalisiert:** `.trim().toLowerCase()` vor jedem Schreiben und jedem Nachschlagen.
- **Tokens:** 32 Byte Zufall (`randomBytes(32).toString("base64url")`), gespeichert ausschließlich als SHA-256-Hex. Bestätigungstoken 7 Tage gültig, einmalig wirksam; Abmeldetoken ohne Ablauf.
- **Identische Antwort nach außen** an jedem öffentlichen Erfassungspunkt (Spec §8 Nr. 4) — neu, bereits eingetragen, abgemeldet und Kontoinhaber sind von außen ununterscheidbar.
- **Bus-Handler dürfen nie werfen** (Spec §7). Jeder Handler ist in `safe()` gewickelt.
- **Migrationen:** `modules/newsletter/migrations/0001_init.sql`, registriert in `infra/migrations/src/manifest.ts`. Nie per Verzeichnis-Scan.
- **Node ≥ 22.5** im Toolchain; `pnpm` als Paketmanager.
- **Tests im selben PR** wie der Code (CLAUDE.md §4). Integrationstests gegen echtes Postgres: `pnpm db:up` muss laufen.

## Entscheidungen, die dieser Plan über die Spec hinaus trifft

Die Spec verweist Detailfragen ausdrücklich in den Implementierungsplan (§13.4). Diese sechs sind hier entschieden:

1. **`shouldPrompt(db, userId)` kommt zusätzlich in `index.ts`.** §5 listet es nicht, aber der Dashboard-Hinweis kann ohne diese Abfrage nicht rendern, und die App darf `newsletter_prompts` nicht selbst lesen (Regel 1).
2. **Die Kontoadresse wird über eine Resolver-Schnittstelle aufgelöst,** nicht durch einen Import von `@bdas/members`. Batch-Signatur (`readonly string[] → Map`), damit der CSV-Export kein N+1 erzeugt. Der Resolver ist `globalThis`-gestützt (`Symbol.for`) — die Lehre aus `965b043`: Next bündelt `instrumentation.ts` getrennt von Route-Handlern, ein `let` auf Modulebene wäre für Server Actions unsichtbar.
3. **B1 (Konto-Schalter) landet in der reservierten Karte „E-Mail-Benachrichtigungen" auf `/account/einstellungen`;** C1 (Hinweis-Banner) auf `/account` direkt unter der h1 „Mein Konto". Beides am 2026-09-07 mit dem Auftraggeber bestätigt. Damit erscheinen Hinweis und Schalter nie auf derselben Seite.
4. **Der zweite Anlauf auf `/registrieren/erfolg` liest die Adresse aus einem kurzlebigen, httpOnly-Cookie,** das `registerAction` setzt — nicht aus einem Query-Parameter. Ein `?email=`-Parameter wäre ein offener Eintragungs-Endpunkt ohne Double-Opt-In und damit genau das Missbrauchswerkzeug, das §8 ausschließt.
5. **ADR-Nummer 0035, nicht 0034.** §12 schlägt `0034-newsletter-consent-model.md` vor; `docs/decisions/0034-account-overview-and-settings.md` existiert bereits.
6. **`subscribeAtRegistration` kommt als dritter Eintragungsweg dazu** (Task 9). §5 kennt ihn nicht, §3.3 verlangt ihn: Die Registrierungs-Checkbox legt eine `pending`-Zeile an, aus der **keine** zweite Bestätigungsmail entsteht. `subscribeAsUser` setzt sofort auf `subscribed`, `subscribePublicly` löst genau diese zweite Mail aus — beide sind hier falsch. Die App darf die Zeile nicht selbst schreiben (Regel 1), also gehört der Weg ins Modul.

## Dateistruktur

**PR 1 — `modules/newsletter/`**

| Datei                        | Verantwortung                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `package.json`               | Workspace-Paket `@bdas/newsletter`                                            |
| `tsconfig.json`              | erbt `tsconfig.base.json`                                                      |
| `README.md`                  | Modul-README nach CLAUDE.md §1 Regel 5                                        |
| `migrations/0001_init.sql`   | Die vier Tabellen                                                              |
| `src/schema.ts`              | Drizzle-Tabellen (privat)                                                      |
| `src/types.ts`               | Statuswerte, Quellen, öffentliche Typen, `newId`                              |
| `src/tokens.ts`              | Token-Erzeugung + SHA-256-Hashing (privat)                                    |
| `src/rate-limit.ts`          | Fixed-Window-Drosselung auf `newsletter_rate_limits` (privat)                 |
| `src/resolver.ts`            | `AccountEmailResolver`-Schnittstelle + globalThis-Slot                        |
| `src/consent-log.ts`         | `recordConsent` — append-only Protokollschreiber (privat)                     |
| `src/events.ts`              | Die zwei veröffentlichten Ereignistypen                                       |
| `src/services/subscribe.ts`  | `subscribeAsUser`, `subscribePublicly`                                        |
| `src/services/confirm.ts`    | `confirmSubscription`, `unsubscribeByToken`, `unsubscribeAsUser`              |
| `src/services/read.ts`       | `getSubscriptionForUser`, `listSubscribers`, `countSubscribers`               |
| `src/services/prompts.ts`    | `declineForUser`, `shouldPrompt`                                              |
| `src/subscribers.ts`         | `registerNewsletterSubscribers` — Bus-Handler, werfen nie                     |
| `src/test-db.ts`             | Privates Testharnisch (Muster: `modules/faq/src/test-db.ts`)                  |
| `src/index.ts`               | Die einzige öffentliche Oberfläche                                            |

Geändert: `infra/migrations/src/manifest.ts`, `core/feature-flags/src/index.ts`. Neu: `docs/decisions/0035-newsletter-consent-model.md`.

**PR 2 — App-Schicht**

| Datei                                             | Verantwortung                                          |
| ------------------------------------------------- | ------------------------------------------------------ |
| `core/design-system/src/tokens.ts`                | `ink.onBrand`, `keyframes.fadeSlideUp`                 |
| `core/design-system/src/tailwind-preset.ts`       | Utilities dazu                                          |
| `core/design-system/src/components/Button.tsx`    | Variante `on-brand`                                     |
| `core/design-system/README.md`                    | Anmeldung der Erweiterung (§7)                         |
| `apps/web/app/_newsletter/flag.ts`                | `requireNewsletterFlag()`                              |
| `apps/web/app/_newsletter/actions.ts`             | Server Actions: eintragen, abbestellen, wegklicken     |
| `apps/web/app/_newsletter/NewsletterToggle.tsx`   | B1 — Zeile mit Schalter                                 |
| `apps/web/app/_newsletter/NewsletterPrompt.tsx`   | C1 — roter Blickfang-Banner                            |
| `apps/web/app/_newsletter/signup-cookie.ts`       | Kurzlebiges Cookie für den zweiten Anlauf              |
| `apps/web/lib/newsletter-bootstrap.ts`            | Resolver + Bus-Subscriber verdrahten                    |
| `apps/web/instrumentation.ts`                     | `bootNewsletter()` beim Start                          |
| `apps/web/app/account/einstellungen/page.tsx`     | Schalter in die reservierte Karte                       |
| `apps/web/app/account/page.tsx`                   | Banner unter der h1                                     |
| `apps/web/app/registrieren/RegistrierenForm.tsx`  | Ungehakte Checkbox (E2-Kasten)                         |
| `apps/web/app/registrieren/actions.ts`            | Checkbox → `pending`, Cookie setzen                    |
| `apps/web/app/registrieren/erfolg/page.tsx`       | Zweiter, weicherer Anlauf                              |
| `e2e/newsletter.e2e.ts`                           | Abnahme für die eingeloggten Flächen                   |

---

# PR 1 — Modul-Fundament

Keine Oberfläche. Am Ende steht ein Modul, das alle Services aus Spec §5 anbietet, seine Ereignisse veröffentlicht und vollständig integrationsgetestet ist.

---

### Task 1: Modul-Gerüst, Schema, Migration, Flag

**Files:**

- Create: `modules/newsletter/package.json`
- Create: `modules/newsletter/tsconfig.json`
- Create: `modules/newsletter/migrations/0001_init.sql`
- Create: `modules/newsletter/src/schema.ts`
- Create: `modules/newsletter/src/types.ts`
- Create: `modules/newsletter/src/test-db.ts`
- Test: `modules/newsletter/src/schema.test.ts`
- Modify: `infra/migrations/src/manifest.ts`
- Modify: `core/feature-flags/src/index.ts:11-31`

**Interfaces:**

- Consumes: `@bdas/db` (`Db`), `@bdas/db/test` (`createTestDb`, `TestDb`), `@bdas/id` (`createId`).
- Produces: die Drizzle-Tabellen `newsletterSubscribers`, `newsletterConsentLog`, `newsletterRateLimits`, `newsletterPrompts`; die Typen `SubscriptionStatus`, `NewsletterSource`, `ConsentEvent`, `Subscription`, `ConsentContext`, `SubscriberRow`, `Counts`, `ConfirmResult`; `newId()`; `setupNewsletterDb()`, `dbReachable()`.

- [ ] **Step 1: Paketgerüst anlegen**

`modules/newsletter/package.json`:

```json
{
  "name": "@bdas/newsletter",
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
    "@bdas/id": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5"
  }
}
```

`modules/newsletter/tsconfig.json`:

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

Dann `pnpm install` ausführen, damit der Workspace das neue Paket verlinkt.

- [ ] **Step 2: Migration schreiben**

`modules/newsletter/migrations/0001_init.sql`:

```sql
-- Newsletter module — consent collection for a newsletter that is not yet
-- sent (docs/superpowers/specs/2026-09-06-newsletter-modul-design.md).
-- user_id is a plain auth-user id, no cross-module FK (blog/faq precedent).

CREATE TABLE newsletter_subscribers (
  id                      text PRIMARY KEY,
  -- Normalized (trim + lowercase). The duplicate key; for rows with a
  -- user_id the *current* account address wins at read time (spec §4),
  -- so this value is allowed to go stale.
  email                   text NOT NULL UNIQUE,
  user_id                 text,
  status                  text NOT NULL
    CHECK (status IN ('pending','subscribed','unsubscribed','declined')),
  confirm_token_hash      text,
  confirm_expires_at      timestamptz,
  unsubscribe_token_hash  text NOT NULL,
  source                  text NOT NULL CHECK (source IN (
    'footer','registrierung','registrierung_erfolg','konto','dashboard_hinweis',
    'blog','event_gast','puck_block','scroll_panel','landingpage'
  )),
  source_path             text,
  group_id                text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  confirmed_at            timestamptz,
  unsubscribed_at         timestamptz
);

-- One subscription per account. Partial, because most rows are anonymous.
CREATE UNIQUE INDEX newsletter_subscribers_user_id_key
  ON newsletter_subscribers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX newsletter_subscribers_unsub_token_key
  ON newsletter_subscribers (unsubscribe_token_hash);
CREATE INDEX newsletter_subscribers_confirm_token_idx
  ON newsletter_subscribers (confirm_token_hash);
CREATE INDEX newsletter_subscribers_status_idx
  ON newsletter_subscribers (status, created_at);

-- Append-only proof under Art. 7 (1) GDPR. No service ever updates or
-- deletes a row here; account deletion cascades (spec §10).
CREATE TABLE newsletter_consent_log (
  id             text PRIMARY KEY,
  subscriber_id  text NOT NULL
    REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  event          text NOT NULL CHECK (event IN (
    'subscribed','confirmed','resubscribed','unsubscribed','declined'
  )),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  -- Plaintext on purpose: a hashed IP proves nothing, and proof is the
  -- column's only purpose (spec §10).
  ip             text,
  user_agent     text,
  source         text,
  source_path    text
);
CREATE INDEX newsletter_consent_log_subscriber_idx
  ON newsletter_consent_log (subscriber_id, occurred_at);

-- Deliberate copy of the fixed-window limiter in modules/auth (spec §4):
-- the original is bound to auth_rate_limits and not exported.
CREATE TABLE newsletter_rate_limits (
  key           text PRIMARY KEY,
  count         integer NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- Server-side memory for "not now" (spec §6.1): follows the person across
-- devices, and §25 TDDDG never applies.
CREATE TABLE newsletter_prompts (
  user_id            text PRIMARY KEY,
  last_dismissed_at  timestamptz NOT NULL DEFAULT now(),
  dismiss_count      integer NOT NULL DEFAULT 0
);
```

- [ ] **Step 3: Drizzle-Schema schreiben**

`modules/newsletter/src/schema.ts`:

```ts
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  userId: text("user_id"),
  status: text("status").notNull(),
  confirmTokenHash: text("confirm_token_hash"),
  confirmExpiresAt: timestamp("confirm_expires_at", { withTimezone: true }),
  unsubscribeTokenHash: text("unsubscribe_token_hash").notNull(),
  source: text("source").notNull(),
  sourcePath: text("source_path"),
  groupId: text("group_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const newsletterConsentLog = pgTable("newsletter_consent_log", {
  id: text("id").primaryKey(),
  subscriberId: text("subscriber_id").notNull(),
  event: text("event").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  source: text("source"),
  sourcePath: text("source_path"),
});

export const newsletterRateLimits = pgTable("newsletter_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const newsletterPrompts = pgTable("newsletter_prompts", {
  userId: text("user_id").primaryKey(),
  lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  dismissCount: integer("dismiss_count").notNull().default(0),
});
```

- [ ] **Step 4: Typen schreiben**

`modules/newsletter/src/types.ts`:

```ts
import { createId } from "@bdas/id";

/** Where a subscription was captured. Metadata for later segmentation
 *  without building a picker UI today (spec §4). */
export const NEWSLETTER_SOURCES = [
  "footer",
  "registrierung",
  "registrierung_erfolg",
  "konto",
  "dashboard_hinweis",
  "blog",
  "event_gast",
  "puck_block",
  "scroll_panel",
  "landingpage",
] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

/** `declined` is factually distinct from `unsubscribed`: the person was
 *  never on the list, they only clicked the hints away three times (§4). */
export type SubscriptionStatus = "pending" | "subscribed" | "unsubscribed" | "declined";

export type ConsentEvent =
  | "subscribed"
  | "confirmed"
  | "resubscribed"
  | "unsubscribed"
  | "declined";

/** IP and user agent for the consent log, plus the site URL the confirmation
 *  link is built from. All optional: a server-side caller may have none. */
export type ConsentContext = {
  readonly ip?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
  readonly siteUrl?: string | null | undefined;
};

export type Subscription = {
  readonly id: string;
  /** The stored duplicate key — NOT necessarily the current account address. */
  readonly email: string;
  readonly userId: string | null;
  readonly status: SubscriptionStatus;
  readonly source: NewsletterSource;
  readonly sourcePath: string | null;
  readonly groupId: string | null;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
  readonly unsubscribedAt: Date | null;
};

/** A row for the board list and the CSV export: `email` is resolved, so for
 *  rows with an account it is the current login address (spec §4). */
export type SubscriberRow = {
  readonly id: string;
  readonly email: string;
  readonly status: SubscriptionStatus;
  readonly source: NewsletterSource;
  readonly sourcePath: string | null;
  readonly groupId: string | null;
  readonly hasAccount: boolean;
  readonly createdAt: Date;
  readonly confirmedAt: Date | null;
};

export type Counts = {
  readonly pending: number;
  readonly subscribed: number;
  readonly unsubscribed: number;
  readonly declined: number;
};

/** `expired` also covers an unknown token: the two are indistinguishable once
 *  a link is old, and both deserve the same friendly "sign up again" page. */
export type ConfirmResult = { readonly status: "confirmed" | "already_confirmed" | "expired" };

export const newId = (): string => createId("nls");
export const newConsentId = (): string => createId("nlc");
```

- [ ] **Step 5: Testharnisch schreiben**

`modules/newsletter/src/test-db.ts` (Muster: `modules/faq/src/test-db.ts`):

```ts
/**
 * Private test harness for the newsletter module. Not re-exported from
 * index.ts. `newsletter_*` have no cross-module FKs — only this module's
 * migrations run.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { createTestDb, type TestDb } from "@bdas/db/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

/** Schema migrations, in apply order. Append new newsletter migrations here. */
export const NEWSLETTER_TEST_MIGRATIONS: ReadonlyArray<ReadonlyArray<string>> = [
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

export async function setupNewsletterDb(): Promise<TestDb> {
  const t = await createTestDb();
  for (const file of NEWSLETTER_TEST_MIGRATIONS) {
    const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
    await t.client.unsafe(sql);
  }
  return t;
}
```

- [ ] **Step 6: Failing test schreiben**

`modules/newsletter/src/schema.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter schema", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const insert = (over: Record<string, unknown> = {}) => {
    const row = {
      id: "nls_1",
      email: "a@example.org",
      status: "pending",
      unsubscribe_token_hash: "h1",
      source: "footer",
      ...over,
    } as Record<string, string>;
    const cols = Object.keys(row);
    const vals = cols.map((c) => `'${row[c]}'`).join(",");
    return t.client.unsafe(
      `INSERT INTO newsletter_subscribers (${cols.join(",")}) VALUES (${vals})`,
    );
  };

  it("rejects a status outside the four known values", async () => {
    await expect(insert({ status: "maybe" })).rejects.toThrow();
  });

  it("rejects an unknown source", async () => {
    await expect(insert({ source: "instagram" })).rejects.toThrow();
  });

  it("rejects a duplicate email", async () => {
    await insert();
    await expect(insert({ id: "nls_2", unsubscribe_token_hash: "h2" })).rejects.toThrow();
  });

  it("allows many anonymous rows but only one row per account", async () => {
    await insert({ user_id: "u1" });
    await insert({ id: "nls_2", email: "b@example.org", unsubscribe_token_hash: "h2" });
    await expect(
      insert({ id: "nls_3", email: "c@example.org", unsubscribe_token_hash: "h3", user_id: "u1" }),
    ).rejects.toThrow();
  });

  it("cascades the consent log when a subscriber is deleted", async () => {
    await insert();
    await t.client.unsafe(
      `INSERT INTO newsletter_consent_log (id, subscriber_id, event)
       VALUES ('nlc_1', 'nls_1', 'subscribed')`,
    );
    await t.client.unsafe(`DELETE FROM newsletter_subscribers WHERE id = 'nls_1'`);
    const left = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_consent_log`);
    expect(left[0]!["n"]).toBe(0);
  });
});
```

- [ ] **Step 7: Test laufen lassen — er muss scheitern**

Run: `pnpm db:up && pnpm vitest run modules/newsletter/src/schema.test.ts`
Expected: FAIL — die Migration existiert noch nicht bzw. wurde noch nicht angewandt, bis Steps 2–5 committet sind. Nach Steps 2–5 muss der Lauf grün sein; scheitert er, liegt der Fehler im SQL.

- [ ] **Step 8: Manifest und Flag ergänzen**

`infra/migrations/src/manifest.ts` — am Ende des Arrays anfügen:

```ts
  // FAQ suite v2 (spec 2026-09-04): faq_* tables, no cross-module FK.
  "faq",
  // Newsletter (spec 2026-09-06): newsletter_* tables, no cross-module FK.
  "newsletter",
];
```

`core/feature-flags/src/index.ts` — in `FLAGS` nach `"faq_suite"` anfügen:

```ts
  "faq_suite",
  "newsletter",
  "podcast",
] as const;
```

- [ ] **Step 9: Tests, Typecheck und Lint laufen lassen**

Run: `pnpm vitest run modules/newsletter core/feature-flags infra/migrations && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add modules/newsletter core/feature-flags/src/index.ts infra/migrations/src/manifest.ts pnpm-lock.yaml
git commit -m "feat(newsletter): module scaffold, schema, migration and flag"
```

---

### Task 2: Token-Erzeugung und -Hashing

**Files:**

- Create: `modules/newsletter/src/tokens.ts`
- Test: `modules/newsletter/src/tokens.test.ts`

**Interfaces:**

- Consumes: `node:crypto`.
- Produces: `newToken(): string`, `hashToken(token: string): string`, `CONFIRM_TTL_MS: number`.

- [ ] **Step 1: Failing test schreiben**

`modules/newsletter/src/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CONFIRM_TTL_MS, hashToken, newToken } from "./tokens";

describe("newsletter tokens", () => {
  it("mints url-safe tokens of 32 random bytes", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("never mints the same token twice", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()));
    expect(seen.size).toBe(200);
  });

  it("hashes to stable lowercase sha-256 hex that is not the token", () => {
    const token = newToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashToken(token)).toBe(hash);
    expect(hashToken(newToken())).not.toBe(hash);
  });

  it("expires confirmation links after seven days", () => {
    expect(CONFIRM_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/tokens.test.ts`
Expected: FAIL mit `Failed to resolve import "./tokens"`

- [ ] **Step 3: Implementierung schreiben**

`modules/newsletter/src/tokens.ts`:

```ts
/**
 * Single-use confirmation tokens and permanent unsubscribe tokens.
 *
 * Stored as SHA-256 hex, never in plaintext. This deliberately differs from
 * `events.guestCancelToken`, which is stored in the clear: a token that
 * *creates* a consent record deserves the stronger protection (spec §4).
 */
import { createHash, randomBytes } from "node:crypto";

/** Confirmation links are valid for seven days (spec §4). */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
```

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/newsletter/src/tokens.ts modules/newsletter/src/tokens.test.ts
git commit -m "feat(newsletter): hashed single-use confirmation tokens"
```

---

### Task 3: Fixed-Window-Drosselung

**Files:**

- Create: `modules/newsletter/src/rate-limit.ts`
- Test: `modules/newsletter/src/rate-limit.test.ts`

**Interfaces:**

- Consumes: `newsletterRateLimits` aus `./schema`, `RateLimitError` aus `@bdas/errors`, `setupNewsletterDb`/`dbReachable` aus `./test-db`.
- Produces: `type Db`, `rateLimit(db, { key, limit, windowMs }): Promise<void>` (wirft `RateLimitError`), `tryRateLimit(db, opts): Promise<boolean>`, `resetRateLimits(db, keyPrefix?): Promise<void>`.

`tryRateLimit` ist der Grund für die Kopie: der öffentliche Erfassungspfad darf bei Überschreitung **nicht** werfen, sondern muss die Mail unterdrücken und nach außen dieselbe Antwort geben (§8 Nr. 4).

- [ ] **Step 1: Failing test schreiben**

`modules/newsletter/src/rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { RateLimitError } from "@bdas/errors";

import { rateLimit, resetRateLimits, tryRateLimit } from "./rate-limit";
import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter rate limit", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("allows exactly `limit` attempts inside one window, then throws", async () => {
    const opts = { key: "ip:1.2.3.4", limit: 3, windowMs: 60_000 };
    await rateLimit(t.db, opts);
    await rateLimit(t.db, opts);
    await rateLimit(t.db, opts);
    await expect(rateLimit(t.db, opts)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const key = "ip:5.6.7.8";
    await rateLimit(t.db, { key, limit: 1, windowMs: 60_000 });
    await expect(rateLimit(t.db, { key, limit: 1, windowMs: 60_000 })).rejects.toThrow();
    // Age the window out rather than sleeping.
    await t.client.unsafe(
      `UPDATE newsletter_rate_limits SET expires_at = now() - interval '1 second'`,
    );
    await expect(rateLimit(t.db, { key, limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("keeps keys independent", async () => {
    await rateLimit(t.db, { key: "a", limit: 1, windowMs: 60_000 });
    await expect(rateLimit(t.db, { key: "b", limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("tryRateLimit reports the verdict instead of throwing", async () => {
    const opts = { key: "addr:a@example.org", limit: 1, windowMs: 60_000 };
    expect(await tryRateLimit(t.db, opts)).toBe(true);
    expect(await tryRateLimit(t.db, opts)).toBe(false);
  });

  it("resetRateLimits clears by prefix", async () => {
    await rateLimit(t.db, { key: "ip:9.9.9.9", limit: 1, windowMs: 60_000 });
    await rateLimit(t.db, { key: "addr:x@example.org", limit: 1, windowMs: 60_000 });
    await resetRateLimits(t.db, "ip:");
    await expect(
      rateLimit(t.db, { key: "ip:9.9.9.9", limit: 1, windowMs: 60_000 }),
    ).resolves.toBeUndefined();
    await expect(
      rateLimit(t.db, { key: "addr:x@example.org", limit: 1, windowMs: 60_000 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/rate-limit.test.ts`
Expected: FAIL mit `Failed to resolve import "./rate-limit"`

- [ ] **Step 3: Implementierung schreiben**

`modules/newsletter/src/rate-limit.ts`:

```ts
/**
 * Per-key fixed-window rate limiter, persisted in `newsletter_rate_limits`.
 *
 * A deliberate copy of `modules/auth/src/rate-limit.ts` (~40 lines): the
 * original is bound to `auth_rate_limits` and is not exported from auth's
 * index.ts, so reaching for it would be a cross-module table access and a
 * breach of rule 1. Extracting the algorithm into core/ was considered and
 * rejected because it would drag a security review onto an otherwise harmless
 * PR — revisit at a third call site (spec §4).
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { RateLimitError } from "@bdas/errors";

import { newsletterRateLimits } from "./schema";

export type Db = PostgresJsDatabase<Record<string, never>>;

export type RateLimitOpts = {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
};

/** Counts one attempt and reports whether it stayed inside the limit. */
export async function tryRateLimit(db: Db, opts: RateLimitOpts): Promise<boolean> {
  const now = new Date();
  const expiresAtIso = new Date(now.getTime() + opts.windowMs).toISOString();

  // Upsert: an expired or missing key starts a fresh window, otherwise the
  // count increments atomically. The explicit ::timestamptz cast is required —
  // postgres-js cannot infer a parameter type inside a CASE branch and would
  // send the Date as text.
  const result = await db
    .insert(newsletterRateLimits)
    .values({
      key: opts.key,
      count: 1,
      windowStart: now,
      expiresAt: new Date(now.getTime() + opts.windowMs),
    })
    .onConflictDoUpdate({
      target: newsletterRateLimits.key,
      set: {
        count: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN 1
          ELSE ${newsletterRateLimits.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN now()
          ELSE ${newsletterRateLimits.windowStart}
        END`,
        expiresAt: sql`CASE
          WHEN ${newsletterRateLimits.expiresAt} < now()
          THEN ${expiresAtIso}::timestamptz
          ELSE ${newsletterRateLimits.expiresAt}
        END`,
      },
    })
    .returning({ count: newsletterRateLimits.count });

  return (result[0]?.count ?? 0) <= opts.limit;
}

/** Throws RateLimitError once the key has exceeded `limit` in the window. */
export async function rateLimit(db: Db, opts: RateLimitOpts): Promise<void> {
  if (!(await tryRateLimit(db, opts))) {
    throw new RateLimitError("Zu viele Versuche. Bitte später erneut versuchen.");
  }
}

/** Test helper — wipes rate limit rows, optionally only one key prefix. */
export async function resetRateLimits(db: Db, keyPrefix?: string): Promise<void> {
  if (keyPrefix) {
    await db
      .delete(newsletterRateLimits)
      .where(sql`${newsletterRateLimits.key} LIKE ${keyPrefix + "%"}`);
  } else {
    await db.delete(newsletterRateLimits);
  }
}
```

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/rate-limit.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add modules/newsletter/src/rate-limit.ts modules/newsletter/src/rate-limit.test.ts
git commit -m "feat(newsletter): fixed-window rate limiter on its own table"
```

---

### Task 4: Adress-Resolver, Einwilligungsprotokoll und `subscribeAsUser`

**Files:**

- Create: `modules/newsletter/src/resolver.ts`
- Create: `modules/newsletter/src/consent-log.ts`
- Create: `modules/newsletter/src/services/subscribe.ts`
- Create: `modules/newsletter/src/services/read.ts`
- Test: `modules/newsletter/src/services/subscribe.test.ts`

**Interfaces:**

- Consumes: `Db` aus `@bdas/db`, `newsletterSubscribers`/`newsletterConsentLog`, `newToken`/`hashToken`/`CONFIRM_TTL_MS`, Typen aus `./types`.
- Produces:
  - `interface AccountEmailResolver { resolve(db: Db, userIds: readonly string[]): Promise<Map<string, string>> }`
  - `getAccountEmailResolver(): AccountEmailResolver`, `setAccountEmailResolver(r): void`
  - `recordConsent(db, { subscriberId, event, context, source, sourcePath }): Promise<void>` (privat)
  - `subscribeAsUser(db, { userId, source, sourcePath, groupId?, context? }): Promise<Subscription>`
  - `getSubscriptionForUser(db, userId): Promise<Subscription | null>`
  - `rowToSubscription(row): Subscription` (privat, in `read.ts`)

- [ ] **Step 1: Resolver schreiben**

`modules/newsletter/src/resolver.ts`:

```ts
/**
 * Resolves account ids to their *current* login address.
 *
 * Email is owned by `modules/auth` and identity by `modules/members`
 * (CLAUDE.md §1 rule 1), so this module depends on a composition-time
 * interface rather than importing either. apps/web wires the concrete
 * resolver at boot. Batched on purpose: the board list and the CSV export
 * resolve hundreds of rows and must not fan out into N+1 queries.
 *
 * Backed by globalThis (Symbol.for) for the same reason as the event bus in
 * `965b043`: Next bundles `instrumentation.ts` separately from route handlers,
 * so a module-level `let` written at boot is invisible to a Server Action.
 */
import type { Db } from "@bdas/db";

export interface AccountEmailResolver {
  resolve(db: Db, userIds: readonly string[]): Promise<Map<string, string>>;
}

/** No resolver wired (flag off, or boot skipped): resolve nothing. Callers
 *  then fall back to the stored duplicate key, which is never wrong, only
 *  possibly stale. */
const unconfigured: AccountEmailResolver = {
  async resolve(): Promise<Map<string, string>> {
    return new Map();
  },
};

const RESOLVER_KEY = Symbol.for("@bdas/newsletter:account-email-resolver");
type ResolverStore = { [RESOLVER_KEY]?: AccountEmailResolver };
function resolverStore(): ResolverStore {
  return globalThis as unknown as ResolverStore;
}

export function getAccountEmailResolver(): AccountEmailResolver {
  return resolverStore()[RESOLVER_KEY] ?? unconfigured;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setAccountEmailResolver(r: AccountEmailResolver): void {
  resolverStore()[RESOLVER_KEY] = r;
}

/** Convenience for the single-row case. Returns null when unresolvable. */
export async function resolveOne(db: Db, userId: string): Promise<string | null> {
  const map = await getAccountEmailResolver().resolve(db, [userId]);
  return map.get(userId) ?? null;
}
```

- [ ] **Step 2: Protokollschreiber schreiben**

`modules/newsletter/src/consent-log.ts`:

```ts
/**
 * Append-only consent log — the proof under Art. 7 (1) GDPR that a consent
 * was given (spec §10). Nothing in this module ever updates or deletes a row
 * here; account deletion cascades from the subscriber.
 */
import type { Db } from "@bdas/db";

import { newsletterConsentLog } from "./schema";
import { newConsentId, type ConsentContext, type ConsentEvent } from "./types";

export async function recordConsent(
  db: Db,
  input: {
    readonly subscriberId: string;
    readonly event: ConsentEvent;
    readonly source?: string | null | undefined;
    readonly sourcePath?: string | null | undefined;
    readonly context?: ConsentContext | undefined;
  },
): Promise<void> {
  await db.insert(newsletterConsentLog).values({
    id: newConsentId(),
    subscriberId: input.subscriberId,
    event: input.event,
    ip: input.context?.ip ?? null,
    userAgent: input.context?.userAgent ?? null,
    source: input.source ?? null,
    sourcePath: input.sourcePath ?? null,
  });
}
```

- [ ] **Step 3: Zeilen-Mapper schreiben**

`modules/newsletter/src/services/read.ts` (zunächst nur Mapper und `getSubscriptionForUser`; `listSubscribers`/`countSubscribers` folgen in Task 7):

```ts
import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { newsletterSubscribers } from "../schema";
import type { NewsletterSource, Subscription, SubscriptionStatus } from "../types";

export function rowToSubscription(
  r: typeof newsletterSubscribers.$inferSelect,
): Subscription {
  return {
    id: r.id,
    email: r.email,
    userId: r.userId,
    status: r.status as SubscriptionStatus,
    source: r.source as NewsletterSource,
    sourcePath: r.sourcePath,
    groupId: r.groupId,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    unsubscribedAt: r.unsubscribedAt,
  };
}

/** The account's subscription, whatever its status — the caller decides what
 *  a `declined` or `unsubscribed` row means for its surface. */
export async function getSubscriptionForUser(
  db: Db,
  userId: string,
): Promise<Subscription | null> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, userId))
    .limit(1);
  return row ? rowToSubscription(row) : null;
}
```

- [ ] **Step 4: Failing test schreiben**

`modules/newsletter/src/services/subscribe.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { getSubscriptionForUser } from "./read";
import { subscribeAsUser } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("subscribeAsUser", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
    setAccountEmailResolver({
      async resolve(_db, ids) {
        return new Map(ids.map((id) => [id, `${id}@example.org`]));
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const log = async () =>
    t.client.unsafe(`SELECT event, ip, source FROM newsletter_consent_log ORDER BY occurred_at`);

  it("subscribes a logged-in account straight to `subscribed` with no mail", async () => {
    const sub = await subscribeAsUser(t.db, {
      userId: "u1",
      source: "konto",
      sourcePath: "/account/einstellungen",
      context: { ip: "203.0.113.7", userAgent: "Firefox" },
    });

    expect(sub.status).toBe("subscribed");
    expect(sub.userId).toBe("u1");
    expect(sub.email).toBe("u1@example.org");
    expect(sub.confirmedAt).not.toBeNull();

    const rows = await log();
    expect(rows).toHaveLength(1);
    expect(rows[0]!["event"]).toBe("subscribed");
    expect(rows[0]!["ip"]).toBe("203.0.113.7");
    expect(rows[0]!["source"]).toBe("konto");
  });

  it("is idempotent: a second click neither duplicates the row nor the log", async () => {
    const first = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    const second = await subscribeAsUser(t.db, { userId: "u1", source: "dashboard_hinweis" });
    expect(second.id).toBe(first.id);
    expect(await log()).toHaveLength(1);
  });

  it("revives an unsubscribed account and logs it as a fresh consent", async () => {
    const sub = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now()
       WHERE id='${sub.id}'`,
    );

    const again = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    expect(again.id).toBe(sub.id);
    expect(again.status).toBe("subscribed");
    expect(again.unsubscribedAt).toBeNull();

    const rows = await log();
    expect(rows.map((r) => r["event"])).toEqual(["subscribed", "resubscribed"]);
  });

  it("adopts an anonymous row that already holds the account address", async () => {
    await t.client.unsafe(
      `INSERT INTO newsletter_subscribers (id, email, status, unsubscribe_token_hash, source)
       VALUES ('nls_anon', 'u1@example.org', 'pending', 'h_anon', 'footer')`,
    );

    const sub = await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    expect(sub.id).toBe("nls_anon");
    expect(sub.userId).toBe("u1");
    expect(sub.status).toBe("subscribed");

    const all = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_subscribers`);
    expect(all[0]!["n"]).toBe(1);
  });

  it("still subscribes when the resolver cannot name the address", async () => {
    setAccountEmailResolver({
      async resolve() {
        return new Map();
      },
    });
    const sub = await subscribeAsUser(t.db, { userId: "u9", source: "konto" });
    expect(sub.status).toBe("subscribed");
    // A synthetic key keeps the NOT NULL/UNIQUE contract without inventing
    // an address that could collide with a real one.
    expect(sub.email).toBe("user:u9");
    expect(await getSubscriptionForUser(t.db, "u9")).not.toBeNull();
  });
});
```

- [ ] **Step 5: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe.test.ts`
Expected: FAIL mit `Failed to resolve import "./subscribe"`

- [ ] **Step 6: `subscribeAsUser` implementieren**

`modules/newsletter/src/services/subscribe.ts`:

```ts
/**
 * The two ways into the list (spec §3). They differ only in how consent is
 * proven: a logged-in click is stronger evidence than a mail round-trip,
 * because authentication already supplied the second factor that
 * double-opt-in exists to establish.
 */
import { eq, or } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { recordConsent } from "../consent-log";
import { resolveOne } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { hashToken, newToken } from "../tokens";
import { newId, type ConsentContext, type NewsletterSource, type Subscription } from "../types";
import { rowToSubscription } from "./read";

export type SubscribeAsUserInput = {
  readonly userId: string;
  readonly source: NewsletterSource;
  readonly sourcePath?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly context?: ConsentContext | undefined;
};

/**
 * One-click subscribe for an authenticated account. No confirmation mail
 * (spec §3.1). Idempotent: an already-subscribed account gets its row back
 * untouched and no second consent-log entry.
 */
export async function subscribeAsUser(
  db: Db,
  input: SubscribeAsUserInput,
): Promise<Subscription> {
  // A resolvable address lets an earlier anonymous row be adopted rather than
  // duplicated. When it cannot be resolved, a synthetic key satisfies the
  // NOT NULL/UNIQUE contract without inventing a plausible address.
  const resolved = (await resolveOne(db, input.userId))?.trim().toLowerCase() ?? null;
  const email = resolved ?? `user:${input.userId}`;

  const existing = await db
    .select()
    .from(newsletterSubscribers)
    .where(
      or(eq(newsletterSubscribers.userId, input.userId), eq(newsletterSubscribers.email, email)),
    )
    .limit(1);

  const now = new Date();
  const row = existing[0];

  if (row) {
    if (row.status === "subscribed" && row.userId === input.userId) {
      return rowToSubscription(row);
    }
    const [updated] = await db
      .update(newsletterSubscribers)
      .set({
        userId: input.userId,
        status: "subscribed",
        confirmedAt: row.confirmedAt ?? now,
        unsubscribedAt: null,
        // A live confirmation link must not survive into the subscribed state.
        confirmTokenHash: null,
        confirmExpiresAt: null,
      })
      .where(eq(newsletterSubscribers.id, row.id))
      .returning();

    await recordConsent(db, {
      subscriberId: row.id,
      // "resubscribed" is the log's word for a *new* consent replacing an
      // ended one (spec §9); a pending row simply completing is "subscribed".
      event: row.status === "unsubscribed" || row.status === "declined" ? "resubscribed" : "subscribed",
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      ...(input.context ? { context: input.context } : {}),
    });
    return rowToSubscription(updated!);
  }

  const [created] = await db
    .insert(newsletterSubscribers)
    .values({
      id: newId(),
      email,
      userId: input.userId,
      status: "subscribed",
      unsubscribeTokenHash: hashToken(newToken()),
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      groupId: input.groupId ?? null,
      confirmedAt: now,
    })
    .returning();

  await recordConsent(db, {
    subscriberId: created!.id,
    event: "subscribed",
    source: input.source,
    sourcePath: input.sourcePath ?? null,
    ...(input.context ? { context: input.context } : {}),
  });
  return rowToSubscription(created!);
}
```

- [ ] **Step 7: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 8: Commit**

```bash
git add modules/newsletter/src
git commit -m "feat(newsletter): one-click subscribe for authenticated accounts"
```

---

### Task 5: Öffentliche Eintragung und die zwei Ereignisse

**Files:**

- Create: `modules/newsletter/src/events.ts`
- Modify: `modules/newsletter/src/services/subscribe.ts` (anfügen)
- Test: `modules/newsletter/src/services/subscribe-public.test.ts`

**Interfaces:**

- Consumes: `getEventBus` aus `@bdas/events`, `tryRateLimit` aus `../rate-limit`, `newToken`/`hashToken`/`CONFIRM_TTL_MS`, `ValidationError` aus `@bdas/errors`.
- Produces:
  - `type ConfirmationRequested`, `type AlreadySubscribed`, `type NewsletterEvent`
  - `CONFIRM_PATH = "/newsletter/bestaetigen"`, `UNSUBSCRIBE_PATH = "/newsletter/abmelden"`
  - `subscribePublicly(db, { email, source, sourcePath, groupId?, context? }): Promise<void>`

Verhalten je Ausgangslage (Spec §9). Nach außen ist die Antwort immer dieselbe — `void`, ohne Auskunft:

| Zustand der Adresse | Zeile                                | Protokoll      | Ereignis                 |
| ------------------- | ------------------------------------ | -------------- | ------------------------ |
| unbekannt           | neu, `pending`, frisches Token       | `subscribed`   | `confirmation_requested` |
| `pending`           | Token + Ablauf erneuert              | —              | `confirmation_requested` |
| `subscribed`        | unverändert                          | —              | `already_subscribed`     |
| `unsubscribed`      | zurück auf `pending`, frisches Token | `resubscribed` | `confirmation_requested` |
| `declined`          | zurück auf `pending`, frisches Token | `resubscribed` | `confirmation_requested` |

`declined` verhält sich wie `unsubscribed`: Wer die eigene Adresse aktiv eintippt, widerruft damit sein früheres Wegklicken.

- [ ] **Step 1: Ereignistypen schreiben**

`modules/newsletter/src/events.ts`:

```ts
/**
 * Events published by the newsletter module. `modules/notifications` holds
 * the subscriber and the templates; this module never sends mail and never
 * imports notifications (spec §2).
 */

/** Carries the token IN PLAINTEXT — the only place it exists after minting.
 *  Consumers must not log the event verbatim. */
export type ConfirmationRequested = {
  readonly type: "newsletter.confirmation_requested";
  readonly email: string;
  readonly token: string;
  readonly confirmUrl: string;
  readonly at: Date;
};

/** Someone typed an address that is already on the list. The reply on screen
 *  is identical to a fresh signup; only the inbox tells them apart (spec §8). */
export type AlreadySubscribed = {
  readonly type: "newsletter.already_subscribed";
  readonly email: string;
  readonly at: Date;
};

export type NewsletterEvent = ConfirmationRequested | AlreadySubscribed;

/** Route paths owned by PR 3. Declared here so the confirmation URL is built
 *  in exactly one place. */
export const CONFIRM_PATH = "/newsletter/bestaetigen";
export const UNSUBSCRIBE_PATH = "/newsletter/abmelden";
```

- [ ] **Step 2: Failing test schreiben**

`modules/newsletter/src/services/subscribe-public.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus, type AnyEvent } from "@bdas/events";

import type { AlreadySubscribed, ConfirmationRequested } from "../events";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { subscribePublicly } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("subscribePublicly", () => {
  let t: TestDb;
  let seen: AnyEvent[];

  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    seen = [];
    getEventBus().subscribe("newsletter.confirmation_requested", (e) => {
      seen.push(e);
    });
    getEventBus().subscribe("newsletter.already_subscribed", (e) => {
      seen.push(e);
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  const rows = async () =>
    t.client.unsafe(`SELECT id, email, status, confirm_token_hash FROM newsletter_subscribers`);

  /** Ages the per-address window out so the next call is not throttled. */
  const bypassThrottle = async () =>
    t.client.unsafe(`UPDATE newsletter_rate_limits SET expires_at = now() - interval '1 second'`);

  it("creates a pending row, logs the consent and asks for a confirmation mail", async () => {
    await subscribePublicly(t.db, {
      email: "  Neu@Example.ORG ",
      source: "footer",
      sourcePath: "/",
      context: { ip: "203.0.113.9", siteUrl: "https://bdas.de" },
    });

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!["email"]).toBe("neu@example.org");
    expect(all[0]!["status"]).toBe("pending");
    expect(all[0]!["confirm_token_hash"]).toMatch(/^[0-9a-f]{64}$/);

    expect(seen).toHaveLength(1);
    const evt = seen[0] as ConfirmationRequested;
    expect(evt.type).toBe("newsletter.confirmation_requested");
    expect(evt.email).toBe("neu@example.org");
    expect(evt.confirmUrl).toBe(`https://bdas.de/newsletter/bestaetigen?token=${evt.token}`);
    // The plaintext token is never what is stored.
    expect(all[0]!["confirm_token_hash"]).not.toBe(evt.token);

    const log = await t.client.unsafe(`SELECT event FROM newsletter_consent_log`);
    expect(log.map((r) => r["event"])).toEqual(["subscribed"]);
  });

  it("re-issues the token for a pending address instead of adding a row", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    const first = (await rows())[0]!["confirm_token_hash"];
    await bypassThrottle();

    await subscribePublicly(t.db, { email: "a@example.org", source: "landingpage" });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!["confirm_token_hash"]).not.toBe(first);
    expect(seen).toHaveLength(2);
  });

  it("answers an already-subscribed address with already_subscribed only", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='subscribed', confirmed_at=now(),
       confirm_token_hash=NULL`,
    );
    await bypassThrottle();
    seen = [];

    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });

    expect(seen).toHaveLength(1);
    expect((seen[0] as AlreadySubscribed).type).toBe("newsletter.already_subscribed");
    const all = await rows();
    expect(all[0]!["status"]).toBe("subscribed");
    expect(all[0]!["confirm_token_hash"]).toBeNull();
  });

  it("treats a return after unsubscribing as a fresh consent", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    await t.client.unsafe(
      `UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now()`,
    );
    await bypassThrottle();

    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });

    const all = await rows();
    expect(all[0]!["status"]).toBe("pending");
    const log = await t.client.unsafe(
      `SELECT event FROM newsletter_consent_log ORDER BY occurred_at`,
    );
    expect(log.map((r) => r["event"])).toEqual(["subscribed", "resubscribed"]);
  });

  it("suppresses the second mail inside 15 minutes but still answers normally", async () => {
    await subscribePublicly(t.db, { email: "a@example.org", source: "footer" });
    seen = [];
    await expect(
      subscribePublicly(t.db, { email: "a@example.org", source: "footer" }),
    ).resolves.toBeUndefined();
    expect(seen).toHaveLength(0);
  });

  it("rejects an address that is not one", async () => {
    await expect(
      subscribePublicly(t.db, { email: "keine-adresse", source: "footer" }),
    ).rejects.toThrow();
    expect(await rows()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe-public.test.ts`
Expected: FAIL — `subscribePublicly` ist noch nicht exportiert.

- [ ] **Step 4: `subscribePublicly` implementieren**

An `modules/newsletter/src/services/subscribe.ts` anfügen; die Importzeilen oben um `getEventBus` (`@bdas/events`), `ValidationError` (`@bdas/errors`), `tryRateLimit` (`../rate-limit`), `CONFIRM_TTL_MS` (`../tokens`) sowie `CONFIRM_PATH` und die beiden Ereignistypen (`../events`) erweitern:

```ts
/** Deliberately permissive: the confirmation mail is the real check. This
 *  only stops obvious typos and keeps junk out of the duplicate key. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** At most one confirmation mail per address per 15 minutes and 3 per day
 *  (spec §8 no. 1). Exceeding it suppresses the mail — never the answer. */
const MAIL_WINDOW_MS = 15 * 60 * 1000;
const MAIL_DAY_MS = 24 * 60 * 60 * 1000;

export type SubscribePubliclyInput = {
  readonly email: string;
  readonly source: NewsletterSource;
  readonly sourcePath?: string | null | undefined;
  readonly groupId?: string | null | undefined;
  readonly context?: ConsentContext | undefined;
};

/**
 * Anonymous signup with full double-opt-in (spec §3.2). Returns `void` in
 * every case — new, known, unsubscribed or an account holder are
 * indistinguishable from the outside (spec §8 no. 4), otherwise the form
 * becomes a tool for checking who is close to the federation.
 */
export async function subscribePublicly(db: Db, input: SubscribePubliclyInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("Bitte gib eine gültige E-Mail-Adresse an.");
  }

  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  // Throttle after the lookup but before anything is published: the counter
  // must tick for every attempt, including the ones that send nothing.
  const mayMail =
    (await tryRateLimit(db, { key: `nl:addr:${email}`, limit: 1, windowMs: MAIL_WINDOW_MS })) &&
    (await tryRateLimit(db, { key: `nl:addr:day:${email}`, limit: 3, windowMs: MAIL_DAY_MS }));

  if (existing?.status === "subscribed") {
    if (mayMail) {
      await getEventBus().publish<AlreadySubscribed>({
        type: "newsletter.already_subscribed",
        email,
        at: new Date(),
      });
    }
    return;
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);
  let subscriberId: string;

  if (existing) {
    subscriberId = existing.id;
    await db
      .update(newsletterSubscribers)
      .set({
        status: "pending",
        confirmTokenHash: hashToken(token),
        confirmExpiresAt: expiresAt,
        unsubscribedAt: null,
      })
      .where(eq(newsletterSubscribers.id, existing.id));

    // A pending row is the same consent still in flight; a row that had ended
    // is a new consent and says so in the log (spec §9).
    if (existing.status === "unsubscribed" || existing.status === "declined") {
      await recordConsent(db, {
        subscriberId,
        event: "resubscribed",
        source: input.source,
        sourcePath: input.sourcePath ?? null,
        ...(input.context ? { context: input.context } : {}),
      });
    }
  } else {
    const [created] = await db
      .insert(newsletterSubscribers)
      .values({
        id: newId(),
        email,
        status: "pending",
        confirmTokenHash: hashToken(token),
        confirmExpiresAt: expiresAt,
        unsubscribeTokenHash: hashToken(newToken()),
        source: input.source,
        sourcePath: input.sourcePath ?? null,
        groupId: input.groupId ?? null,
      })
      .returning();
    subscriberId = created!.id;
    await recordConsent(db, {
      subscriberId,
      event: "subscribed",
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      ...(input.context ? { context: input.context } : {}),
    });
  }

  if (!mayMail) return;

  const base = (input.context?.siteUrl ?? "").replace(/\/$/, "");
  await getEventBus().publish<ConfirmationRequested>({
    type: "newsletter.confirmation_requested",
    email,
    token,
    confirmUrl: `${base}${CONFIRM_PATH}?token=${encodeURIComponent(token)}`,
    at: new Date(),
  });
}
```

- [ ] **Step 5: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/subscribe-public.test.ts`
Expected: PASS (6 Tests)

- [ ] **Step 6: Commit**

```bash
git add modules/newsletter/src
git commit -m "feat(newsletter): public double-opt-in signup with throttled mail events"
```

---

### Task 6: Bestätigen und Abbestellen

**Files:**

- Create: `modules/newsletter/src/services/confirm.ts`
- Test: `modules/newsletter/src/services/confirm.test.ts`

**Interfaces:**

- Consumes: `hashToken` (`../tokens`), `recordConsent` (`../consent-log`), `newsletterSubscribers` (`../schema`), `NotFoundError` (`@bdas/errors`).
- Produces:
  - `confirmSubscription(db, token, context?): Promise<ConfirmResult>`
  - `unsubscribeByToken(db, token, context?): Promise<void>` — wirft `NotFoundError` bei unbekanntem Token
  - `unsubscribeAsUser(db, { userId, context? }): Promise<void>`

Einmaligkeit wird über den **Status** erzwungen, nicht durch Löschen des Hashes: Bestätigungslinks werden regelmäßig zweimal geklickt, und der zweite Klick soll eine freundliche Bestätigung sehen (§9), keine Fehlerseite. Damit ein alter Link nach einer Abmeldung nicht wieder anmeldet, löscht jeder Abmeldepfad `confirm_token_hash`.

- [ ] **Step 1: Failing test schreiben**

`modules/newsletter/src/services/confirm.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";
import { NotFoundError } from "@bdas/errors";
import { resetEventBus } from "@bdas/events";

import { setAccountEmailResolver } from "../resolver";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { hashToken } from "../tokens";
import { confirmSubscription, unsubscribeAsUser, unsubscribeByToken } from "./confirm";
import { getSubscriptionForUser } from "./read";
import { subscribeAsUser } from "./subscribe";

const reachable = await dbReachable();

describe.skipIf(!reachable)("confirm and unsubscribe", () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    setAccountEmailResolver({
      async resolve(_db, ids) {
        return new Map(ids.map((id) => [id, `${id}@example.org`]));
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  /** A pending row with known plaintext tokens, without going through the
   *  public path (which throttles and publishes). */
  async function seedPending(over: { confirmExpires?: string } = {}): Promise<void> {
    await t.client.unsafe(
      `INSERT INTO newsletter_subscribers
         (id, email, status, confirm_token_hash, confirm_expires_at,
          unsubscribe_token_hash, source)
       VALUES ('nls_1', 'a@example.org', 'pending', '${hashToken("conf")}',
               ${over.confirmExpires ?? "now() + interval '7 days'"},
               '${hashToken("unsub")}', 'footer')`,
    );
  }

  it("confirms a pending row and logs it", async () => {
    await seedPending();
    const res = await confirmSubscription(t.db, "conf", { ip: "203.0.113.4" });
    expect(res.status).toBe("confirmed");

    const [row] = await t.client.unsafe(`SELECT status, confirmed_at FROM newsletter_subscribers`);
    expect(row!["status"]).toBe("subscribed");
    expect(row!["confirmed_at"]).not.toBeNull();

    const log = await t.client.unsafe(`SELECT event, ip FROM newsletter_consent_log`);
    expect(log[0]!["event"]).toBe("confirmed");
    expect(log[0]!["ip"]).toBe("203.0.113.4");
  });

  it("greets a second click instead of failing, and does not log twice", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");
    const again = await confirmSubscription(t.db, "conf");
    expect(again.status).toBe("already_confirmed");
    const log = await t.client.unsafe(`SELECT count(*)::int AS n FROM newsletter_consent_log`);
    expect(log[0]!["n"]).toBe(1);
  });

  it("reports an expired link as expired and leaves the row pending", async () => {
    await seedPending({ confirmExpires: "now() - interval '1 second'" });
    expect((await confirmSubscription(t.db, "conf")).status).toBe("expired");
    const [row] = await t.client.unsafe(`SELECT status FROM newsletter_subscribers`);
    expect(row!["status"]).toBe("pending");
  });

  it("reports an unknown token as expired — the two are indistinguishable", async () => {
    expect((await confirmSubscription(t.db, "wer-weiss")).status).toBe("expired");
  });

  it("unsubscribes by token, idempotently, and kills the confirmation link", async () => {
    await seedPending();
    await confirmSubscription(t.db, "conf");

    await unsubscribeByToken(t.db, "unsub");
    const [row] = await t.client.unsafe(
      `SELECT status, unsubscribed_at, confirm_token_hash FROM newsletter_subscribers`,
    );
    expect(row!["status"]).toBe("unsubscribed");
    expect(row!["unsubscribed_at"]).not.toBeNull();
    expect(row!["confirm_token_hash"]).toBeNull();

    // A stale confirmation link must not resurrect the subscription.
    expect((await confirmSubscription(t.db, "conf")).status).toBe("expired");
    // Clicking unsubscribe twice is normal and must stay quiet.
    await expect(unsubscribeByToken(t.db, "unsub")).resolves.toBeUndefined();
  });

  it("rejects an unknown unsubscribe token", async () => {
    await expect(unsubscribeByToken(t.db, "nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("unsubscribes an account and logs it", async () => {
    await subscribeAsUser(t.db, { userId: "u1", source: "konto" });
    await unsubscribeAsUser(t.db, { userId: "u1" });

    const sub = await getSubscriptionForUser(t.db, "u1");
    expect(sub!.status).toBe("unsubscribed");
    const log = await t.client.unsafe(
      `SELECT event FROM newsletter_consent_log ORDER BY occurred_at`,
    );
    expect(log.map((r) => r["event"])).toEqual(["subscribed", "unsubscribed"]);
  });

  it("stays quiet when an account with no subscription unsubscribes", async () => {
    await expect(unsubscribeAsUser(t.db, { userId: "ghost" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/confirm.test.ts`
Expected: FAIL mit `Failed to resolve import "./confirm"`

- [ ] **Step 3: Implementierung schreiben**

`modules/newsletter/src/services/confirm.ts`:

```ts
/**
 * Closing the loop on a consent: confirming it, and ending it.
 *
 * Single use is enforced through the *status*, not by deleting the hash — a
 * confirmation link gets clicked twice all the time, and the second click
 * deserves a friendly page rather than an error (spec §9). Every unsubscribe
 * path clears `confirm_token_hash` so a stale link cannot resurrect an ended
 * subscription.
 */
import { eq } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { NotFoundError } from "@bdas/errors";

import { recordConsent } from "../consent-log";
import { newsletterSubscribers } from "../schema";
import { hashToken } from "../tokens";
import type { ConfirmResult, ConsentContext } from "../types";

export async function confirmSubscription(
  db: Db,
  token: string,
  context?: ConsentContext,
): Promise<ConfirmResult> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.confirmTokenHash, hashToken(token)))
    .limit(1);

  // Unknown and expired are answered identically: once a link is old the two
  // are indistinguishable, and both want the same "sign up again" page.
  if (!row) return { status: "expired" };
  if (row.status === "subscribed") return { status: "already_confirmed" };
  if (!row.confirmExpiresAt || row.confirmExpiresAt.getTime() < Date.now()) {
    return { status: "expired" };
  }

  await db
    .update(newsletterSubscribers)
    .set({ status: "subscribed", confirmedAt: new Date(), unsubscribedAt: null })
    .where(eq(newsletterSubscribers.id, row.id));

  await recordConsent(db, {
    subscriberId: row.id,
    event: "confirmed",
    source: row.source,
    sourcePath: row.sourcePath,
    ...(context ? { context } : {}),
  });
  return { status: "confirmed" };
}

/** The permanent link from the confirmation mail — the only way out for an
 *  anonymous subscriber without an account (spec §3.4). */
export async function unsubscribeByToken(
  db: Db,
  token: string,
  context?: ConsentContext,
): Promise<void> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, hashToken(token)))
    .limit(1);
  if (!row) throw new NotFoundError("Abmeldelink ungültig.");
  if (row.status === "unsubscribed") return;
  await endSubscription(db, row.id, row.source, row.sourcePath, context);
}

/** The switch under "Mein Konto" (spec §3.4). Quiet when there is nothing to
 *  end — the surface offers this only when a subscription exists, so a call
 *  without one is a stale page, not an error worth showing. */
export async function unsubscribeAsUser(
  db: Db,
  input: { readonly userId: string; readonly context?: ConsentContext | undefined },
): Promise<void> {
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, input.userId))
    .limit(1);
  if (!row || row.status === "unsubscribed") return;
  await endSubscription(db, row.id, row.source, row.sourcePath, input.context);
}

async function endSubscription(
  db: Db,
  id: string,
  source: string,
  sourcePath: string | null,
  context: ConsentContext | undefined,
): Promise<void> {
  await db
    .update(newsletterSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      confirmTokenHash: null,
      confirmExpiresAt: null,
    })
    .where(eq(newsletterSubscribers.id, id));

  await recordConsent(db, {
    subscriberId: id,
    event: "unsubscribed",
    source,
    sourcePath,
    ...(context ? { context } : {}),
  });
}
```

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/confirm.test.ts`
Expected: PASS (8 Tests)

- [ ] **Step 5: Commit**

```bash
git add modules/newsletter/src/services/confirm.ts modules/newsletter/src/services/confirm.test.ts
git commit -m "feat(newsletter): confirm, unsubscribe by token and unsubscribe as user"
```

---

### Task 7: Board-Lesedienste — `listSubscribers` und `countSubscribers`

**Files:**

- Modify: `modules/newsletter/src/services/read.ts`
- Test: `modules/newsletter/src/services/read.test.ts`

**Interfaces:**

- Consumes: `getAccountEmailResolver` (`../resolver`), `newsletterSubscribers` (`../schema`), Typen aus `../types`.
- Produces:
  - `listSubscribers(db, filter?): Promise<SubscriberRow[]>`
  - `countSubscribers(db): Promise<Counts>`
  - `type SubscriberFilter`

Die Oberfläche dazu baut erst PR 5. Die Dienste gehören trotzdem in PR 1: Sie sind Modul-Innenleben (Regel 1), und die Entdopplungsregel aus Spec §4 will gegen echtes Postgres getestet sein, nicht gegen eine Board-Seite.

**Entdopplung auf der aufgelösten Adresse.** Der eindeutige Index auf `email` greift in einem Randfall nicht: Ändert ein Mitglied seine Kontoadresse von A auf B und trägt sich danach jemand öffentlich mit B ein, zeigen zwei Zeilen auf dieselbe gelieferte Adresse. Entdoppelt wird deshalb beim Lesen, und die Zeile mit `user_id` gewinnt — ihre Adresse wandert mit, die andere ist ein toter Schlüssel.

Das lässt sich nicht in SQL erledigen: Der aufgelöste Wert liegt in `modules/auth`, nicht in den Tabellen dieses Moduls. Deshalb ein Full Scan plus **ein** gebündelter Resolver-Aufruf. Bei der erwarteten Größenordnung (niedrige Tausender) ist das billiger als jede Alternative; jenseits von ~50 000 Zeilen gehören die Kennzahlen in eine materialisierte Sicht.

`countSubscribers` läuft bewusst durch **dieselbe** Pipeline und nicht über ein `GROUP BY status`. Ein Gruppierungs-Zähler wäre eine Abfrage billiger, könnte aber um die Zahl der Dubletten von der Liste darunter abweichen — und eine Kachel, die etwas anderes sagt als die Tabelle, unter der sie steht, ist ein Fehlerbericht.

> **Randnotiz zur Spec.** §4 verwirft das Nachziehen des Schlüssels über ein Adressänderungs-Ereignis mit der Begründung, `modules/auth` veröffentliche ein solches Ereignis nicht. Das stimmt inzwischen nicht mehr: `auth.email.changed` existiert (`modules/auth/src/events.ts`). Die Entscheidung bleibt hier trotzdem unverändert — die Entdopplung beim Lesen kostet nichts, und ein zweiter Schreibpfad auf denselben Schlüssel wäre zusätzliche Angriffsfläche für Dubletten. Wer das später drehen will, tut es als eigene Entscheidung mit eigenem ADR, nicht nebenbei.

- [ ] **Step 1: Failing test schreiben**

`modules/newsletter/src/services/read.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { countSubscribers, listSubscribers } from "./read";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter read services", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    // Default: nothing resolvable, so the stored key is used verbatim.
    setAccountEmailResolver({ async resolve() { return new Map(); } });
  });
  afterEach(async () => {
    await t.cleanup();
    setAccountEmailResolver({ async resolve() { return new Map(); } });
  });

  const add = async (over: Partial<typeof newsletterSubscribers.$inferInsert> = {}) => {
    const id = over.id ?? `nls_${Math.random().toString(36).slice(2, 10)}`;
    await t.db.insert(newsletterSubscribers).values({
      id,
      email: `${id}@example.org`,
      status: "subscribed",
      unsubscribeTokenHash: `h_${id}`,
      source: "footer",
      ...over,
    });
    return id;
  };

  it("returns newest first", async () => {
    await add({ id: "nls_old", createdAt: new Date("2026-01-01T00:00:00Z") });
    await add({ id: "nls_new", createdAt: new Date("2026-02-01T00:00:00Z") });
    const rows = await listSubscribers(t.db);
    expect(rows.map((r) => r.id)).toEqual(["nls_new", "nls_old"]);
  });

  it("reports the current account address, not the stored key", async () => {
    await add({ id: "nls_u", email: "old@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() { return new Map([["u1", "neu@example.org"]]); },
    });
    const [row] = await listSubscribers(t.db);
    expect(row?.email).toBe("neu@example.org");
    expect(row?.hasAccount).toBe(true);
  });

  it("falls back to the stored key when the account is unresolvable", async () => {
    await add({ id: "nls_u", email: "old@example.org", userId: "u1" });
    const [row] = await listSubscribers(t.db);
    expect(row?.email).toBe("old@example.org");
  });

  it("deduplicates on the resolved address, the account row wins", async () => {
    await add({ id: "nls_anon", email: "b@example.org" });
    await add({ id: "nls_acct", email: "a@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() { return new Map([["u1", "b@example.org"]]); },
    });
    const rows = await listSubscribers(t.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("nls_acct");
  });

  it("filters by status, source and group", async () => {
    await add({ id: "nls_a", status: "pending", source: "footer", groupId: "g1" });
    await add({ id: "nls_b", status: "subscribed", source: "konto", groupId: "g1" });
    await add({ id: "nls_c", status: "subscribed", source: "konto", groupId: "g2" });

    expect((await listSubscribers(t.db, { status: "pending" })).map((r) => r.id)).toEqual(["nls_a"]);
    expect((await listSubscribers(t.db, { source: "konto" })).map((r) => r.id).sort()).toEqual([
      "nls_b",
      "nls_c",
    ]);
    expect((await listSubscribers(t.db, { groupId: "g2" })).map((r) => r.id)).toEqual(["nls_c"]);
  });

  it("searches the resolved address, not the stale stored one", async () => {
    await add({ id: "nls_u", email: "alt@example.org", userId: "u1" });
    setAccountEmailResolver({
      async resolve() { return new Map([["u1", "zeynep@example.org"]]); },
    });
    expect((await listSubscribers(t.db, { search: "ZEYNEP" })).map((r) => r.id)).toEqual(["nls_u"]);
    expect(await listSubscribers(t.db, { search: "alt@" })).toEqual([]);
  });

  it("counts per status over the same deduplicated set", async () => {
    await add({ id: "nls_p", status: "pending" });
    await add({ id: "nls_s1", status: "subscribed" });
    await add({ id: "nls_s2", email: "dup@example.org", status: "subscribed" });
    await add({ id: "nls_s3", email: "x@example.org", status: "subscribed", userId: "u1" });
    await add({ id: "nls_u", status: "unsubscribed" });
    await add({ id: "nls_d", status: "declined" });
    setAccountEmailResolver({
      async resolve() { return new Map([["u1", "dup@example.org"]]); },
    });

    const counts = await countSubscribers(t.db);
    // nls_s2 and nls_s3 collapse into one.
    expect(counts).toEqual({ pending: 1, subscribed: 2, unsubscribed: 1, declined: 1 });
    expect((await listSubscribers(t.db, { status: "subscribed" })).length).toBe(counts.subscribed);
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm db:up && pnpm vitest run modules/newsletter/src/services/read.test.ts`
Expected: FAIL — `listSubscribers` und `countSubscribers` existieren noch nicht.

- [ ] **Step 3: Implementierung schreiben**

`modules/newsletter/src/services/read.ts` — ergänzen (`rowToSubscription` und `getSubscriptionForUser` bleiben unverändert):

```ts
import { desc, eq } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { getAccountEmailResolver } from "../resolver";
import { newsletterSubscribers } from "../schema";
import type {
  Counts,
  NewsletterSource,
  SubscriberRow,
  Subscription,
  SubscriptionStatus,
} from "../types";

export type SubscriberFilter = {
  readonly status?: SubscriptionStatus | undefined;
  readonly source?: NewsletterSource | undefined;
  readonly groupId?: string | null | undefined;
  /** Case-insensitive substring of the RESOLVED address. */
  readonly search?: string | undefined;
};

/**
 * Every row, address-resolved and deduplicated — the single pipeline behind
 * both the list and the counters, so the tiles can never contradict the table
 * beneath them.
 *
 * Deduplication cannot move into SQL: the resolved value lives in
 * modules/auth, not in this module's tables (spec §4). One full scan plus one
 * batched resolver call. Fine at the expected size; past ~50k rows the
 * counters want a materialized view.
 */
async function loadDeduped(db: Db): Promise<SubscriberRow[]> {
  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt));

  const userIds = rows.flatMap((r) => (r.userId === null ? [] : [r.userId]));
  const resolved =
    userIds.length > 0
      ? await getAccountEmailResolver().resolve(db, userIds)
      : new Map<string, string>();

  const byEmail = new Map<string, SubscriberRow>();
  for (const r of rows) {
    const email = (r.userId === null ? r.email : (resolved.get(r.userId) ?? r.email))
      .trim()
      .toLowerCase();
    const row: SubscriberRow = {
      id: r.id,
      email,
      status: r.status as SubscriptionStatus,
      source: r.source as NewsletterSource,
      sourcePath: r.sourcePath,
      groupId: r.groupId,
      hasAccount: r.userId !== null,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
    };
    const seen = byEmail.get(email);
    // The account row wins: its address is the one that keeps following the
    // person (spec §4). Otherwise the newer row stays — rows arrive desc.
    if (!seen || (row.hasAccount && !seen.hasAccount)) byEmail.set(email, row);
  }
  return [...byEmail.values()];
}

export async function listSubscribers(
  db: Db,
  filter: SubscriberFilter = {},
): Promise<SubscriberRow[]> {
  const needle = filter.search?.trim().toLowerCase();
  return (await loadDeduped(db))
    .filter((r) => {
      if (filter.status !== undefined && r.status !== filter.status) return false;
      if (filter.source !== undefined && r.source !== filter.source) return false;
      if (filter.groupId !== undefined && r.groupId !== filter.groupId) return false;
      // After resolution on purpose: a SQL LIKE would search the stale
      // duplicate key and miss the address the board actually sees.
      if (needle !== undefined && needle !== "" && !r.email.includes(needle)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function countSubscribers(db: Db): Promise<Counts> {
  const tally: Record<SubscriptionStatus, number> = {
    pending: 0,
    subscribed: 0,
    unsubscribed: 0,
    declined: 0,
  };
  for (const r of await loadDeduped(db)) tally[r.status] += 1;
  return tally;
}
```

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/read.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 5: Commit**

```bash
git add modules/newsletter/src/services/read.ts modules/newsletter/src/services/read.test.ts
git commit -m "feat(newsletter): board read services with resolved-address dedup"
```

---

### Task 8: Wiedervorlage, Wegklick-Deckel und `declined`

**Files:**

- Create: `modules/newsletter/src/services/prompts.ts`
- Test: `modules/newsletter/src/services/prompts.test.ts`

**Interfaces:**

- Consumes: `newsletterPrompts`/`newsletterSubscribers` (`../schema`), `recordConsent` (`../consent-log`), `resolveOne` (`../resolver`), `newToken`/`hashToken` (`../tokens`), `newId` (`../types`).
- Produces:
  - `declineForUser(db, { userId, context? }): Promise<void>`
  - `shouldPrompt(db, userId): Promise<boolean>`
  - `PROMPT_INTERVAL_MS`, `MAX_DISMISSALS`

Spec §6.1 in Code: Wegklicken heißt „nicht jetzt". Wiedervorlage nach 14 Tagen, Deckel bei drei Wegklicks, danach `status = declined` und dauerhaft Ruhe. Serverseitig, damit die Entscheidung dem Menschen über seine Geräte folgt — und damit §25 TDDDG gar nicht erst greift.

**`shouldPrompt` ist bewusst streng:** Existiert überhaupt eine Abonnentenzeile, wird nicht gefragt. `subscribed` ist dabei, `pending` wartet auf eine Bestätigung, `unsubscribed` und `declined` sind Antworten. Alle vier heißen „nicht nachfassen". Die Wiedervorlage gilt nur für Menschen, die noch nie irgendetwas gesagt haben.

- [ ] **Step 1: Failing test schreiben**

`modules/newsletter/src/services/prompts.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TestDb } from "@bdas/db/test";

import { setAccountEmailResolver } from "../resolver";
import { newsletterConsentLog, newsletterPrompts, newsletterSubscribers } from "../schema";
import { dbReachable, setupNewsletterDb } from "../test-db";
import { declineForUser, MAX_DISMISSALS, PROMPT_INTERVAL_MS, shouldPrompt } from "./prompts";

const reachable = await dbReachable();

describe.skipIf(!reachable)("newsletter prompts", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    setAccountEmailResolver({
      async resolve(_db, ids) {
        return new Map(ids.map((id) => [id, `${id}@example.org`]));
      },
    });
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("prompts an account that has never answered", async () => {
    expect(await shouldPrompt(t.db, "u1")).toBe(true);
  });

  it("stays quiet for the fortnight after a dismissal", async () => {
    await declineForUser(t.db, { userId: "u1" });
    expect(await shouldPrompt(t.db, "u1")).toBe(false);
  });

  it("asks again once the fortnight is over", async () => {
    await declineForUser(t.db, { userId: "u1" });
    await t.db
      .update(newsletterPrompts)
      .set({ lastDismissedAt: new Date(Date.now() - PROMPT_INTERVAL_MS - 1000) });
    expect(await shouldPrompt(t.db, "u1")).toBe(true);
  });

  it("goes quiet for good after three dismissals and records `declined`", async () => {
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u1" });

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.status).toBe("declined");
    expect(row?.userId).toBe("u1");
    expect(row?.email).toBe("u1@example.org");

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.map((l) => l.event)).toEqual(["declined"]);

    // Not a re-prompt candidate even after the interval elapses.
    await t.db.update(newsletterPrompts).set({ lastDismissedAt: new Date(0) });
    expect(await shouldPrompt(t.db, "u1")).toBe(false);
  });

  it("never overwrites an existing answer with `declined`", async () => {
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_1",
      email: "u1@example.org",
      userId: "u1",
      status: "unsubscribed",
      unsubscribeTokenHash: "h1",
      source: "konto",
    });
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u1" });

    const rows = await t.db.select().from(newsletterSubscribers);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("unsubscribed");
  });

  it("does not prompt anyone who already has a row, whatever its status", async () => {
    for (const status of ["pending", "subscribed", "unsubscribed", "declined"] as const) {
      const userId = `u_${status}`;
      await t.db.insert(newsletterSubscribers).values({
        id: `nls_${status}`,
        email: `${status}@example.org`,
        userId,
        status,
        unsubscribeTokenHash: `h_${status}`,
        source: "konto",
      });
      expect(await shouldPrompt(t.db, userId)).toBe(false);
    }
  });

  it("falls back to a synthetic key when the account address is unresolvable", async () => {
    setAccountEmailResolver({ async resolve() { return new Map(); } });
    for (let i = 0; i < MAX_DISMISSALS; i += 1) await declineForUser(t.db, { userId: "u9" });
    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.email).toBe("user:u9");
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/services/prompts.test.ts`
Expected: FAIL — `modules/newsletter/src/services/prompts.ts` existiert nicht.

- [ ] **Step 3: Implementierung schreiben**

`modules/newsletter/src/services/prompts.ts`:

```ts
/**
 * The re-prompt memory behind the two interrupting hints (spec §6.1).
 *
 * Server-side rather than in the browser, so the decision follows the person
 * across their devices — and so §25 TDDDG never applies in the first place.
 */
import { eq, sql } from "drizzle-orm";

import type { Db } from "@bdas/db";

import { recordConsent } from "../consent-log";
import { resolveOne } from "../resolver";
import { newsletterPrompts, newsletterSubscribers } from "../schema";
import { hashToken, newToken } from "../tokens";
import { newId, type ConsentContext } from "../types";

/** "Not now" lasts a fortnight. */
export const PROMPT_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** Three dismissals are an answer (spec §6.1). */
export const MAX_DISMISSALS = 3;

/**
 * One dismissal. On the third, the account moves to `declined` and is never
 * asked again — the point at which "offensiv" would tip into "nervig".
 */
export async function declineForUser(
  db: Db,
  input: { readonly userId: string; readonly context?: ConsentContext | undefined },
): Promise<void> {
  const [prompt] = await db
    .insert(newsletterPrompts)
    .values({ userId: input.userId, dismissCount: 1 })
    .onConflictDoUpdate({
      target: newsletterPrompts.userId,
      set: {
        dismissCount: sql`${newsletterPrompts.dismissCount} + 1`,
        lastDismissedAt: new Date(),
      },
    })
    .returning();

  if (!prompt || prompt.dismissCount < MAX_DISMISSALS) return;

  // Never overwrite an existing row: `subscribed` and `unsubscribed` are
  // decisions the person made. `declined` only records that we stopped asking.
  const [existing] = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, input.userId))
    .limit(1);
  if (existing) return;

  const resolved = (await resolveOne(db, input.userId))?.trim().toLowerCase() ?? null;
  const [row] = await db
    .insert(newsletterSubscribers)
    .values({
      id: newId(),
      // Same synthetic fallback as `subscribeAsUser`: satisfies NOT NULL and
      // UNIQUE without inventing a plausible address.
      email: resolved ?? `user:${input.userId}`,
      userId: input.userId,
      status: "declined",
      // Minted even though nothing will ever mail this row: the column is NOT
      // NULL, and a row that later flips to `subscribed` needs it anyway.
      unsubscribeTokenHash: hashToken(newToken()),
      source: "dashboard_hinweis",
    })
    // An anonymous row already holds this address. It is a different consent
    // record and must not be touched; the prompt counter alone silences us.
    .onConflictDoNothing()
    .returning();

  if (row) {
    await recordConsent(db, {
      subscriberId: row.id,
      event: "declined",
      source: "dashboard_hinweis",
      ...(input.context ? { context: input.context } : {}),
    });
  }
}

/**
 * Whether an interrupting hint may be shown to this account.
 *
 * Any subscriber row at all means the question has been answered — dabei,
 * waiting on a confirmation, opted out, or declined. Only `/account` reopens
 * the subject (spec §3.4).
 */
export async function shouldPrompt(db: Db, userId: string): Promise<boolean> {
  const [sub] = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.userId, userId))
    .limit(1);
  if (sub) return false;

  const [prompt] = await db
    .select()
    .from(newsletterPrompts)
    .where(eq(newsletterPrompts.userId, userId))
    .limit(1);
  if (!prompt) return true;
  if (prompt.dismissCount >= MAX_DISMISSALS) return false;
  return Date.now() - prompt.lastDismissedAt.getTime() >= PROMPT_INTERVAL_MS;
}
```

- [ ] **Step 4: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/services/prompts.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 5: Commit**

```bash
git add modules/newsletter/src/services/prompts.ts modules/newsletter/src/services/prompts.test.ts
git commit -m "feat(newsletter): re-prompt window, dismissal cap and declined status"
```

---

### Task 9: Der Registrierungspfad — `subscribeAtRegistration` und der Bus-Handler

**Files:**

- Modify: `modules/newsletter/src/services/subscribe.ts`
- Create: `modules/newsletter/src/subscribers.ts`
- Test: `modules/newsletter/src/subscribers.test.ts`

**Interfaces:**

- Consumes: `getEventBus` (`@bdas/events`), `newsletterSubscribers` (`./schema`), `recordConsent` (`./consent-log`), `newToken`/`hashToken` (`./tokens`).
- Produces:
  - `subscribeAtRegistration(db, { userId, email, source, sourcePath?, context? }): Promise<void>`
  - `registerNewsletterSubscribers(db): void`

**Warum ein dritter Eintragungsweg.** Spec §5 listet ihn nicht, §3.3 verlangt ihn: Die Checkbox in `/registrieren` legt eine `pending`-Zeile an, aus der **keine** zweite Bestätigungsmail entsteht — die Verifizierungsmail der Registrierung erledigt beide Bestätigungen. Keiner der beiden vorhandenen Dienste kann das. `subscribeAsUser` setzt sofort auf `subscribed` (§3.1, zulässig nur bei bereits verifizierter Sitzung), `subscribePublicly` veröffentlicht `newsletter.confirmation_requested` und löst damit genau die zweite Mail aus, die §3.3 ausschließt. Der Weg gehört ins Modul und nicht in die App-Schicht, weil sonst die App eine `newsletter_*`-Zeile schriebe (Regel 1).

**Der Handler darf niemals werfen** (Spec §7 Nr. 1). `core/events` ist synchron und reicht Fehler an den Publisher durch; `auth.user.verified` wird im Verifizierungspfad veröffentlicht. Ein durchschlagender Fehler ließe die E-Mail-Verifizierung eines Menschen an einer Newsletter-Zeile scheitern — ein Nebenfeature legte den Kernpfad lahm. Jeder Handler-Rumpf steckt in `safe()`.

- [ ] **Step 1: `subscribeAtRegistration` schreiben**

`modules/newsletter/src/services/subscribe.ts` — anfügen:

```ts
export type SubscribeAtRegistrationInput = {
  readonly userId: string;
  readonly email: string;
  readonly source: Extract<NewsletterSource, "registrierung" | "registrierung_erfolg">;
  readonly sourcePath?: string | null | undefined;
  readonly context?: ConsentContext | undefined;
};

/**
 * The registration path (spec §3.3). Writes a `pending` row and publishes
 * NOTHING: the verification mail the registration already sends is the double
 * opt-in for both. `auth.user.verified` lifts the row to `subscribed`
 * (see subscribers.ts). Never verified means never on the list.
 *
 * Idempotent and quiet by design — this runs inside `registerAction`, where a
 * newsletter hiccup must never cost someone their account.
 */
export async function subscribeAtRegistration(
  db: Db,
  input: SubscribeAtRegistrationInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email))
    .limit(1);

  if (existing) {
    // Adopt an earlier anonymous row rather than duplicating it. Status is
    // left alone: a `subscribed` row is already done, and an `unsubscribed`
    // one gets its new consent through the account surfaces, not here.
    if (existing.userId === null) {
      await db
        .update(newsletterSubscribers)
        .set({ userId: input.userId })
        .where(eq(newsletterSubscribers.id, existing.id));
    }
    return;
  }

  const [row] = await db
    .insert(newsletterSubscribers)
    .values({
      id: newId(),
      email,
      userId: input.userId,
      status: "pending",
      unsubscribeTokenHash: hashToken(newToken()),
      source: input.source,
      sourcePath: input.sourcePath ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (row) {
    await recordConsent(db, {
      subscriberId: row.id,
      event: "subscribed",
      source: input.source,
      sourcePath: input.sourcePath ?? null,
      ...(input.context ? { context: input.context } : {}),
    });
  }
}
```

- [ ] **Step 2: Failing test schreiben**

`modules/newsletter/src/subscribers.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@bdas/db";
import type { TestDb } from "@bdas/db/test";
import { getEventBus, resetEventBus } from "@bdas/events";

import { newsletterConsentLog, newsletterSubscribers } from "./schema";
import { subscribeAtRegistration } from "./services/subscribe";
import { registerNewsletterSubscribers } from "./subscribers";
import { dbReachable, setupNewsletterDb } from "./test-db";

const reachable = await dbReachable();

const verified = (userId: string, email: string) => ({
  type: "auth.user.verified" as const,
  userId,
  email,
  at: new Date(),
});

describe.skipIf(!reachable)("newsletter bus subscribers", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await setupNewsletterDb();
    resetEventBus();
    registerNewsletterSubscribers(t.db);
  });
  afterEach(async () => {
    resetEventBus();
    await t.cleanup();
  });

  it("lifts the pending registration row to subscribed", async () => {
    await subscribeAtRegistration(t.db, {
      userId: "u1",
      email: "Neu@Example.org",
      source: "registrierung",
    });
    await getEventBus().publish(verified("u1", "neu@example.org"));

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.status).toBe("subscribed");
    expect(row?.confirmedAt).toBeInstanceOf(Date);
    expect(row?.userId).toBe("u1");

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.map((l) => l.event)).toEqual(["subscribed", "confirmed"]);
  });

  it("adopts an anonymous row for the account without changing its status", async () => {
    await t.db.insert(newsletterSubscribers).values({
      id: "nls_anon",
      email: "anon@example.org",
      status: "subscribed",
      unsubscribeTokenHash: "h1",
      source: "footer",
      confirmedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await getEventBus().publish(verified("u2", "anon@example.org"));

    const [row] = await t.db.select().from(newsletterSubscribers);
    expect(row?.userId).toBe("u2");
    expect(row?.status).toBe("subscribed");
    expect(row?.confirmedAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does nothing for someone who never ticked the box", async () => {
    await getEventBus().publish(verified("u3", "fremd@example.org"));
    expect(await t.db.select().from(newsletterSubscribers)).toEqual([]);
  });

  it("never lets a failure escape into the verification path", async () => {
    resetEventBus();
    const broken = {
      select() {
        throw new Error("db is down");
      },
    } as unknown as Db;
    registerNewsletterSubscribers(broken);

    await expect(getEventBus().publish(verified("u4", "x@example.org"))).resolves.toBeUndefined();
  });

  it("registers idempotently — a second call does not double-handle", async () => {
    registerNewsletterSubscribers(t.db);
    await subscribeAtRegistration(t.db, {
      userId: "u5",
      email: "einmal@example.org",
      source: "registrierung",
    });
    await getEventBus().publish(verified("u5", "einmal@example.org"));

    const log = await t.db.select().from(newsletterConsentLog);
    expect(log.filter((l) => l.event === "confirmed")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run modules/newsletter/src/subscribers.test.ts`
Expected: FAIL — `modules/newsletter/src/subscribers.ts` existiert nicht.

- [ ] **Step 4: Implementierung schreiben**

`modules/newsletter/src/subscribers.ts`:

```ts
/**
 * Bus subscribers — the one place this module *reacts* to another module's
 * event instead of publishing its own.
 *
 * `core/events` is synchronous and rethrows into the publisher (spec §7), and
 * `auth.user.verified` is published inside the verification path. A throw here
 * would fail a person's email verification over a newsletter row, so every
 * handler body is wrapped in `safe()` and can only ever log.
 */
import { eq, or } from "drizzle-orm";

import type { Db } from "@bdas/db";
import { getEventBus, type AnyEvent, type EventHandler, type Subscription } from "@bdas/events";

import { recordConsent } from "./consent-log";
import { newsletterSubscribers } from "./schema";

/**
 * Structural copy of `auth.user.verified` (modules/auth/src/events.ts).
 * Declared locally so this module needs no dependency on @bdas/auth: it reacts
 * to a shape on the bus, not to auth's implementation (rule 2). The tradeoff
 * is that a rename in auth would not fail the build here — the registration
 * E2E in PR 2 is what catches that.
 */
type UserVerified = {
  readonly type: "auth.user.verified";
  readonly userId: string;
  readonly email: string;
  readonly at: Date;
};

let subs: Subscription[] = [];

function safe<E extends AnyEvent>(fn: EventHandler<E>): EventHandler<E> {
  return async (e: E) => {
    try {
      await fn(e);
    } catch (err) {
      console.error(`[newsletter] handler for "${e.type}" failed:`, err);
    }
  };
}

async function onVerified(db: Db, e: UserVerified): Promise<void> {
  const email = e.email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(or(eq(newsletterSubscribers.userId, e.userId), eq(newsletterSubscribers.email, email)))
    .limit(1);
  if (!row) return;

  // The registration row (spec §3.3): the platform's own verification mail is
  // the double opt-in, so nothing is sent and no token is consumed.
  if (row.status === "pending") {
    await db
      .update(newsletterSubscribers)
      .set({
        status: "subscribed",
        confirmedAt: e.at,
        userId: e.userId,
        confirmTokenHash: null,
        confirmExpiresAt: null,
      })
      .where(eq(newsletterSubscribers.id, row.id));
    await recordConsent(db, {
      subscriberId: row.id,
      event: "confirmed",
      source: row.source,
      sourcePath: row.sourcePath,
    });
    return;
  }

  // An anonymous row that turns out to belong to an account: adopt it, leave
  // the status alone (spec §9, row 6).
  if (row.userId === null) {
    await db
      .update(newsletterSubscribers)
      .set({ userId: e.userId })
      .where(eq(newsletterSubscribers.id, row.id));
  }
}

/** Idempotent: re-registering replaces the previous subscriptions. */
export function registerNewsletterSubscribers(db: Db): void {
  for (const s of subs) s.unsubscribe();
  subs = [];

  const bus = getEventBus();
  subs.push(
    bus.subscribe<UserVerified>(
      "auth.user.verified",
      safe<UserVerified>((e) => onVerified(db, e)),
    ),
  );
}
```

- [ ] **Step 5: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run modules/newsletter/src/subscribers.test.ts`
Expected: PASS (5 Tests)

- [ ] **Step 6: Commit**

```bash
git add modules/newsletter/src/subscribers.ts modules/newsletter/src/subscribers.test.ts modules/newsletter/src/services/subscribe.ts
git commit -m "feat(newsletter): registration signup path and the auth.user.verified handler"
```

---

### Task 10: Öffentliche Oberfläche, README und ADR

**Files:**

- Create: `modules/newsletter/src/index.ts`
- Create: `modules/newsletter/src/index.test.ts`
- Create: `modules/newsletter/README.md`
- Create: `docs/decisions/0035-newsletter-consent-model.md`

**Interfaces:**

- Produces: die exportierte Oberfläche aus Spec §5, plus `shouldPrompt`, `subscribeAtRegistration` und die Resolver-Verdrahtung.

Privat bleiben: `schema.ts`, `tokens.ts`, `rate-limit.ts`, `consent-log.ts`, `test-db.ts` und `getAccountEmailResolver` — nur der Setter ist öffentlich, Konsumenten verdrahten einen Resolver, sie lesen keinen.

- [ ] **Step 1: `index.ts` schreiben**

`modules/newsletter/src/index.ts`:

```ts
/**
 * Public surface of the newsletter module (CLAUDE.md §1 rule 8).
 *
 * Private and deliberately not re-exported: `schema.ts`, `tokens.ts`,
 * `rate-limit.ts`, `consent-log.ts`, `test-db.ts`, and the resolver *getter* —
 * consumers wire a resolver, they never read one.
 */
export {
  subscribeAsUser,
  subscribeAtRegistration,
  subscribePublicly,
  type SubscribeAsUserInput,
  type SubscribeAtRegistrationInput,
  type SubscribePubliclyInput,
} from "./services/subscribe";
export { confirmSubscription, unsubscribeAsUser, unsubscribeByToken } from "./services/confirm";
export {
  countSubscribers,
  getSubscriptionForUser,
  listSubscribers,
  type SubscriberFilter,
} from "./services/read";
export {
  declineForUser,
  shouldPrompt,
  MAX_DISMISSALS,
  PROMPT_INTERVAL_MS,
} from "./services/prompts";
export { registerNewsletterSubscribers } from "./subscribers";
export { setAccountEmailResolver, type AccountEmailResolver } from "./resolver";
export {
  CONFIRM_PATH,
  UNSUBSCRIBE_PATH,
  type AlreadySubscribed,
  type ConfirmationRequested,
  type NewsletterEvent,
} from "./events";
export {
  NEWSLETTER_SOURCES,
  type ConfirmResult,
  type ConsentContext,
  type Counts,
  type NewsletterSource,
  type SubscriberRow,
  type Subscription,
  type SubscriptionStatus,
} from "./types";
```

- [ ] **Step 2: Oberflächentest schreiben**

`modules/newsletter/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import * as api from "./index";

/** Rule 8 as a test: the surface changes only on purpose. */
describe("newsletter public surface", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        "CONFIRM_PATH",
        "MAX_DISMISSALS",
        "NEWSLETTER_SOURCES",
        "PROMPT_INTERVAL_MS",
        "UNSUBSCRIBE_PATH",
        "confirmSubscription",
        "countSubscribers",
        "declineForUser",
        "getSubscriptionForUser",
        "listSubscribers",
        "registerNewsletterSubscribers",
        "setAccountEmailResolver",
        "shouldPrompt",
        "subscribeAsUser",
        "subscribeAtRegistration",
        "subscribePublicly",
        "unsubscribeAsUser",
        "unsubscribeByToken",
      ].sort(),
    );
  });

  it("keeps the private internals private", () => {
    const keys = Object.keys(api);
    for (const leaked of [
      "newsletterSubscribers",
      "hashToken",
      "newToken",
      "recordConsent",
      "getAccountEmailResolver",
    ]) {
      expect(keys).not.toContain(leaked);
    }
  });
});
```

- [ ] **Step 3: README schreiben**

`modules/newsletter/README.md` — Gliederung (Muster: `modules/faq/README.md`):

1. **Zweck.** Sammelt und protokolliert Newsletter-Einwilligungen. Versendet nichts.
2. **Tabellen.** Die vier aus §4, je ein Satz, plus der Hinweis, dass niemand sonst sie liest oder schreibt.
3. **Zwei Wege in die Liste.** §3.1 gegen §3.2, plus der Registrierungssonderweg §3.3 — je drei Sätze mit der Begründung, warum eingeloggte Klicks ohne Bestätigungsmail auskommen.
4. **Oberfläche.** Die Signaturen aus `index.ts`, je eine Zeile.
5. **Ereignisse.** Was veröffentlicht wird (`newsletter.confirmation_requested`, `newsletter.already_subscribed`) und was abonniert wird (`auth.user.verified`), samt der Regel, dass Handler nie werfen.
6. **Der Resolver.** Warum die Kontoadresse zur Kompositionszeit verdrahtet und nicht importiert wird, mit Verweis auf `965b043` für die `globalThis`-Stütze.
7. **Flag und Migrationen.** `newsletter`, `migrations/0001_init.sql`, Eintrag im Manifest.
8. **Tests.** `pnpm db:up` nötig; keine DB-Mocks.

- [ ] **Step 4: ADR schreiben**

`docs/decisions/0035-newsletter-consent-model.md` — nach dem Muster der vorhandenen ADRs (Status / Kontext / Entscheidung / Begründung / Folgen / Alternativen):

- **Entscheidung:** Einwilligung ohne Bestätigungsmail für eingeloggte Nutzer, vollständiges Double-Opt-In für alle anderen; die Verifizierungsmail der Registrierung zählt als Bestätigung für beides.
- **Begründung:** Die Authentifizierung ist der zweite Faktor, den Double-Opt-In sonst erst herstellt. Ein protokollierter Klick in einer angemeldeten Sitzung weist die Einwilligung des Adressinhabers stärker nach als ein Klick in einer Mail, die jeder weiterleiten kann.
- **Folgen:** `newsletter_consent_log` ist der append-only Nachweis nach Art. 7 Abs. 1 DSGVO; `/datenschutz` und `docs/datenschutz/` sind um den Zweck „Newsletter" zu ergänzen — **das passiert in PR 3**, zusammen mit der öffentlichen Erfassung, weil vorher keine Adresse außerhalb der Plattform erhoben wird.
- **Alternativen:** Double-Opt-In auch für Eingeloggte (verwirft eine bereits stärkere Nachweislage und kostet Abschlüsse); Single-Opt-In für alle (in Deutschland nicht haltbar).

- [ ] **Step 5: Volllauf**

Run: `pnpm vitest run modules/newsletter && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add modules/newsletter/src/index.ts modules/newsletter/src/index.test.ts modules/newsletter/README.md docs/decisions/0035-newsletter-consent-model.md
git commit -m "feat(newsletter): public surface, README and ADR 0035"
```

- [ ] **Step 7: PR 1 abnehmen**

Prüfliste, alles muss zutreffen:

- `pnpm vitest run modules/newsletter` grün, mit laufendem `pnpm db:up`.
- `pnpm typecheck && pnpm lint` grün.
- Kein Import von `@bdas/notifications`, `@bdas/members` oder `@bdas/auth` in `modules/newsletter` — `grep -rn "@bdas/\(notifications\|members\|auth\)" modules/newsletter/src` liefert nichts.
- Nichts außerhalb von `modules/newsletter` importiert etwas anderes als `@bdas/newsletter`.
- `infra/migrations/src/manifest.ts` enthält `"newsletter"`; `core/feature-flags` kennt `newsletter`.
- Keine Oberfläche, keine Route, kein E-Mail-Versand in diesem PR.

---

# PR 2 — Eingeloggte Flächen und die Registrierung

Alles, was Spec §12 Nr. 2 nennt: der Schalter auf `/account/einstellungen`, der Hinweis-Banner auf `/account`, die Checkbox in `/registrieren`, der zweite Anlauf auf `/registrieren/erfolg` und die Verdrahtung des Handlers für `auth.user.verified`. **Kein** öffentliches Eingabefeld, kein Footer, keine `/newsletter`-Seite, kein Versand — das ist PR 3.

**Die eine harte Regel dieses PRs:** Alle Flächen kennen nur „an". Abgeschaltet wird ausschließlich unter „Mein Konto" (Spec §3.4). Wer abonniert hat oder `declined` ist, sieht die anderen Flächen gar nicht erst.

**Flag-Prüfung, zweierlei.** Eine eigene Route prüft mit `requireNewsletterFlag()` und verschwindet bei ausgeschaltetem Flag in einem 404. Eine Fläche, die **in einer fremden Seite** sitzt — Schalter und Banner tun das —, darf das niemals: Ein `notFound()` in `/account` nähme dem Mitglied seine ganze Kontoseite wegen eines abgeschalteten Nebenfeatures. Diese Flächen fragen `newsletterEnabled()` und rendern schlicht `null`.

---

### Task 11: Design-Token für den Blickfang H1

**Files:**

- Modify: `core/design-system/src/tokens.ts`
- Modify: `core/design-system/src/tailwind-preset.ts`
- Modify: `core/design-system/src/components/Button.tsx`
- Modify: `core/design-system/README.md`
- Test: `core/design-system/src/components/Button.test.tsx`

**Interfaces:**

- Produces: `colors.ink.onBrand`, `keyframes.fadeSlideUp`, Utilities `text-bdas-ink-on-brand` und `animate-bdas-fade-slide-up`, Button-Variante `on-brand`.

Spec §13.3 wählt H1: Die Fläche wird selbst zum Akzent — volles Markenrot, weiße Schrift, weißer Knopf auf rotem Grund. Drei Werte fehlen dafür in den Token, und CLAUDE.md §7 verlangt, dass sie **angemeldet** und nicht nebenbei eingeführt werden. Genau das ist dieser Task, und er kommt vor jeder Fläche, damit keine Komponente in Versuchung gerät, ein `#fff` inline zu schreiben.

`fadeSlideUp` ist die Spiegelung des vorhandenen `fadeSlideDown`: Letzteres kommt von `translateY(-5px)` herab, die Fläche soll aber von unten aufsteigen (§13.3). Angewendet wird sie ausschließlich mit dem `motion-safe:`-Präfix — bei `prefers-reduced-motion` steht die Fläche einfach da, was ihrer Wirkung nichts nimmt, weil die Wirkung aus der Farbe kommt.

- [ ] **Step 1: Failing test schreiben**

`core/design-system/src/components/Button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { colors, keyframes } from "../tokens";
import { tailwindPreset } from "../tailwind-preset";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button on-brand variant", () => {
  it("is a white button with red label — legal only on a brand-red field", () => {
    render(<Button variant="on-brand">Ja, ich bin dabei</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("bg-bdas-surface");
    expect(cls).toContain("text-bdas-red");
  });

  it("keeps the existing variants untouched", () => {
    render(<Button>Primär</Button>);
    expect(screen.getByRole("button").className).toContain("bg-bdas-red");
  });
});

describe("H1 eye-catcher tokens", () => {
  it("declares the on-brand ink and exposes it as a utility", () => {
    expect(colors.ink.onBrand).toBe("#ffffff");
    const bdas = (tailwindPreset.theme?.extend?.["colors"] as Record<string, Record<string, string>>)[
      "bdas"
    ];
    expect(bdas?.["ink-on-brand"]).toBe(colors.ink.onBrand);
  });

  it("mirrors fadeSlideDown as fadeSlideUp and wires the animation", () => {
    expect(keyframes.fadeSlideUp.from.transform).toBe("translateY(5px)");
    const anim = tailwindPreset.theme?.extend?.["animation"] as Record<string, string>;
    expect(anim["bdas-fade-slide-up"]).toContain("bdas-fade-slide-up");
    expect(anim["bdas-fade-slide-up"]).toContain("400ms");
  });
});
```

- [ ] **Step 2: Test laufen lassen — er muss scheitern**

Run: `pnpm vitest run core/design-system`
Expected: FAIL — weder `ink.onBrand` noch `fadeSlideUp` noch die Variante existieren.

- [ ] **Step 3: Token ergänzen**

`core/design-system/src/tokens.ts` — in `colors.ink` anfügen:

```ts
    /** Tertiary — accordion icons, captions. */
    muted: "#888888",
    /** Text and icons ON a filled brand-red surface (H1 eye-catcher, spec
     *  §13.3). Legal only on `brand.red`; never a page text color. */
    onBrand: "#ffffff",
```

in `keyframes` anfügen:

```ts
  /**
   * Mirror of `fadeSlideDown` for a surface that rises into view: the H1
   * eye-catcher enters from below (spec §13.3). Always applied with the
   * `motion-safe:` prefix — the effect carries the colour, not the movement.
   */
  fadeSlideUp: {
    from: { opacity: "0", transform: "translateY(5px)" },
    to: { opacity: "1", transform: "translateY(0)" },
  },
```

`core/design-system/src/tailwind-preset.ts` — drei Ergänzungen:

```ts
        bdas: {
          red: colors.brand.red,
          ink: colors.ink.strong,
          "ink-body": colors.ink.body,
          "ink-muted": colors.ink.muted,
          "ink-on-brand": colors.ink.onBrand,
          surface: colors.surface.base,
          "surface-hover": colors.surface.hover,
        },
```

```ts
      keyframes: {
        "bdas-fade-slide-down": keyframes.fadeSlideDown,
        "bdas-fade-slide-up": keyframes.fadeSlideUp,
        "bdas-loader-sweep": keyframes.loaderSweep,
        "bdas-loader-cap": keyframes.loaderCap,
      },
      animation: {
        "bdas-fade-slide-down": "bdas-fade-slide-down 400ms ease forwards",
        "bdas-fade-slide-up": `bdas-fade-slide-up ${motion.durationSlow} ease forwards`,
        ...
      },
```

- [ ] **Step 4: Button-Variante ergänzen**

`core/design-system/src/components/Button.tsx`:

```ts
export type ButtonVariant = "primary" | "secondary" | "ghost" | "on-brand";
```

```ts
  /** White button on a filled brand-red field (spec §13.3). Only legal inside
   *  such a field — on a white page it disappears. */
  "on-brand":
    "bg-bdas-surface text-bdas-red hover:bg-bdas-surface-hover " +
    "focus-visible:ring-2 focus-visible:ring-bdas-ink-on-brand/60",
```

- [ ] **Step 5: Bildsprache anmelden**

`core/design-system/README.md` — bei den Komponentenrezepten ergänzen:

```
- **brand field (H1 eye-catcher)** — a full brand.red surface with ink.onBrand
  text and an `on-brand` (white) button; radius md, shadow cardResting, hover
  lift.sm + cardLiftMd over durationSoft. Enters with fadeSlideUp over
  durationSlow, `motion-safe:` only. Reserved for the newsletter capture
  surfaces A3 and C1 (newsletter spec §13.3) — it is the loudest thing on an
  otherwise white page and does not scale to a third use without a decision.
```

- [ ] **Step 6: Test laufen lassen — er muss bestehen**

Run: `pnpm vitest run core/design-system && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add core/design-system
git commit -m "feat(design-system): on-brand ink, fadeSlideUp and the on-brand button variant"
```

---

### Task 12: Flag-Helfer, Bootstrap und Boot-Verdrahtung

**Files:**

- Create: `apps/web/app/_newsletter/flag.ts`
- Create: `apps/web/lib/newsletter-bootstrap.ts`
- Modify: `apps/web/instrumentation.ts`

**Interfaces:**

- Consumes: `getUserExport` (`@bdas/auth`), `getDb` (`@bdas/db`), `registerNewsletterSubscribers`/`setAccountEmailResolver` (`@bdas/newsletter`).
- Produces: `newsletterEnabled()`, `requireNewsletterFlag()`, `bootNewsletter()`.

**Der Resolver ist hier bewusst schlicht.** `@bdas/auth` bietet heute nur `getUserExport(db, userId)` — einen Einzelleser. In PR 2 wird immer genau **eine** Kennung aufgelöst (die des angemeldeten Menschen), also ist die Schleife eine Abfrage. Bevor PR 5 die Board-Liste ausliefert, braucht `@bdas/auth` einen echten Stapelleser (`getUserEmails(db, ids)`); Hunderte Zeilen durch diese Schleife wären ein N+1 aus dem Lehrbuch. Das steht als Kommentar im Code und gehört in die Beschreibung von PR 5.

Der Bootstrap wird **nicht** gelatcht, wenn das Flag aus ist (Muster: `bootNotifications`): Ein Boot mit ausgeschaltetem Flag darf die Verdrahtung nicht dauerhaft verhindern.

- [ ] **Step 1: Flag-Helfer schreiben**

`apps/web/app/_newsletter/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * On in Vercel previews so the branch is reviewable on its preview URL before
 * the production flag flips (same shape as `faqEnabled`). Set
 * BDAS_FLAG_NEWSLETTER=true to enable it anywhere.
 */
export function newsletterEnabled(): boolean {
  return isFlagOn("newsletter") || process.env["VERCEL_ENV"] === "preview";
}

/**
 * For newsletter-OWNED routes only (PR 3's /newsletter, confirm, unsubscribe).
 *
 * Never call this from a surface embedded in someone else's page: a 404 inside
 * /account would take a member's whole account page away over a switched-off
 * side feature. Those surfaces ask `newsletterEnabled()` and render null.
 */
export function requireNewsletterFlag(): void {
  if (!newsletterEnabled()) notFound();
}
```

- [ ] **Step 2: Bootstrap schreiben**

`apps/web/lib/newsletter-bootstrap.ts`:

```ts
import { getUserExport } from "@bdas/auth";
import { getDb, type Db } from "@bdas/db";
import { registerNewsletterSubscribers, setAccountEmailResolver } from "@bdas/newsletter";

import { newsletterEnabled } from "../app/_newsletter/flag";

let booted = false;

/**
 * Idempotent newsletter bootstrap: wires the AccountEmailResolver and
 * subscribes to `auth.user.verified`, but only when the flag is on, so the
 * module is inert in production until acceptance-complete (rule 6 applied to
 * a non-route module).
 */
export function bootNewsletter(): void {
  if (booted) return;
  if (!newsletterEnabled()) return; // not latched — a flag-off boot must not permanently disable wiring

  setAccountEmailResolver({
    async resolve(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
      // `@bdas/auth` exposes only a single-user reader today. PR 2 resolves
      // exactly one id per request (the signed-in account), so this is one
      // query. BEFORE PR 5 ships the board list, auth needs a real batch read
      // (`getUserEmails(db, ids)`) — hundreds of rows through this loop would
      // be a textbook N+1, which is the very thing the batch signature exists
      // to prevent.
      const pairs = await Promise.all(
        userIds.map(async (id) => {
          const user = await getUserExport(db, id);
          return user ? ([id, user.email] as const) : null;
        }),
      );
      return new Map(pairs.filter((p): p is readonly [string, string] => p !== null));
    },
  });

  registerNewsletterSubscribers(getDb());
  booted = true;
}
```

- [ ] **Step 3: Beim Boot verdrahten**

`apps/web/instrumentation.ts` — nach `bootMembers()`:

```ts
    const { bootNewsletter } = await import("./lib/newsletter-bootstrap");
    // Registering a subscription is synchronous and in-process; there is
    // nothing transient to degrade gracefully from. A flag-off boot returns
    // immediately.
    bootNewsletter();
```

Zusätzlich rufen die Server Actions `bootNewsletter()` selbst auf (Task 13). Das ist kein Gürtel-und-Hosenträger, sondern die Lehre aus `965b043`: Next bündelt `instrumentation.ts` getrennt, und der Resolver muss in **dem** Bündel gesetzt sein, das die Action ausführt. Der Bus ist `globalThis`-gestützt und damit geteilt, der `booted`-Merker nicht — deshalb ist `bootNewsletter()` idempotent gebaut.

- [ ] **Step 4: Typecheck und Lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_newsletter/flag.ts apps/web/lib/newsletter-bootstrap.ts apps/web/instrumentation.ts
git commit -m "feat(newsletter): app flag helper, resolver wiring and boot registration"
```

---

### Task 13: Server Actions und das Registrierungs-Cookie

**Files:**

- Create: `apps/web/app/_newsletter/signup-cookie.ts`
- Create: `apps/web/app/_newsletter/actions.ts`

**Interfaces:**

- Consumes: `getCurrentUser` (`@bdas/auth`), `readSessionCookie` (`../../lib/auth-cookie`), `subscribeAsUser`/`unsubscribeAsUser`/`declineForUser`/`subscribeAtRegistration` (`@bdas/newsletter`).
- Produces:
  - `type NewsletterActionState = { readonly ok?: boolean; readonly error?: string }`
  - `subscribeMeAction(prev, formData)`, `unsubscribeMeAction(prev, formData)`, `dismissPromptAction(prev, formData)`
  - `subscribeAfterRegistrationAction(prev, formData)`
  - `setSignupCookie`, `readSignupCookie`, `clearSignupCookie`

**Warum ein Cookie und kein `?email=`.** Ein Query-Parameter auf der Erfolgsseite wäre ein offener Eintragungs-Endpunkt ohne Double-Opt-In: Jeder könnte `/registrieren/erfolg?email=fremde@adresse.de` aufrufen und eine fremde Adresse eintragen. Genau dieses Missbrauchswerkzeug schließt §8 aus. Das Cookie ist httpOnly, wird ausschließlich vom Server für eine Adresse gesetzt, die soeben eine Verifizierungsmail erhalten hat, und trägt zusätzlich die Konto-Kennung — der zweite Anlauf kann deshalb genau dieses eine Konto eintragen und sonst nichts.

Es wird **nur** gesetzt, wenn die Checkbox leer blieb. Wer schon Ja gesagt hat, wird nicht ein zweites Mal gefragt (§6 „Ruhe nach der Eintragung").

- [ ] **Step 1: Cookie-Modul schreiben**

`apps/web/app/_newsletter/signup-cookie.ts`:

```ts
import { cookies } from "next/headers";

/**
 * The account that just registered, kept for exactly one page: the second,
 * softer attempt on /registrieren/erfolg (spec §6).
 *
 * httpOnly, server-set, path-scoped to /registrieren and 15 minutes old at
 * most. Carries the user id as well as the address, so the second attempt can
 * write a `pending` row for THAT account and nothing else — see the reasoning
 * against a `?email=` parameter in the task preamble.
 *
 * Set only when the registration checkbox was left unticked.
 */
export const SIGNUP_COOKIE = "bdas_nl_signup";
const PATH = "/registrieren";
const MAX_AGE_S = 15 * 60;

export type PendingSignup = { readonly userId: string; readonly email: string };

export function setSignupCookie(signup: PendingSignup): void {
  cookies().set(SIGNUP_COOKIE, `${signup.userId}|${signup.email}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: PATH,
    maxAge: MAX_AGE_S,
  });
}

export function readSignupCookie(): PendingSignup | null {
  const raw = cookies().get(SIGNUP_COOKIE)?.value;
  if (!raw) return null;
  const at = raw.indexOf("|");
  if (at <= 0 || at === raw.length - 1) return null;
  return { userId: raw.slice(0, at), email: raw.slice(at + 1) };
}

/** Deleting needs the same path the cookie was written with. */
export function clearSignupCookie(): void {
  cookies().delete({ name: SIGNUP_COOKIE, path: PATH });
}
```

- [ ] **Step 2: Actions schreiben**

`apps/web/app/_newsletter/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getCurrentUser } from "@bdas/auth";
import { getDb } from "@bdas/db";
import {
  declineForUser,
  subscribeAsUser,
  subscribeAtRegistration,
  unsubscribeAsUser,
  type NewsletterSource,
} from "@bdas/newsletter";

import { readSessionCookie } from "../../lib/auth-cookie";
import { bootNewsletter } from "../../lib/newsletter-bootstrap";
import { newsletterEnabled } from "./flag";
import { clearSignupCookie, readSignupCookie } from "./signup-cookie";

export type NewsletterActionState = { readonly ok?: boolean; readonly error?: string };

const GENERIC_ERROR = "Das hat gerade nicht geklappt. Versuch es bitte noch einmal.";

/** IP and user agent for the consent log (Art. 7 (1) GDPR proof, spec §10). */
function consentContext() {
  const h = headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

async function currentUserId(): Promise<string | null> {
  const user = await getCurrentUser(getDb(), readSessionCookie());
  return user?.id ?? null;
}

/** One-click subscribe for a signed-in account. No confirmation mail (§3.1). */
export async function subscribeMeAction(
  _prev: NewsletterActionState,
  formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  // The surface names itself; an unknown value is a bug, not user input.
  const source = String(formData.get("source") ?? "konto") as NewsletterSource;
  const sourcePath = String(formData.get("sourcePath") ?? "") || null;

  try {
    await subscribeAsUser(getDb(), { userId, source, sourcePath, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] subscribeAsUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  revalidatePath("/account/einstellungen");
  return { ok: true };
}

/** The only way off the list for an account holder (spec §3.4). */
export async function unsubscribeMeAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  try {
    await unsubscribeAsUser(getDb(), { userId, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] unsubscribeAsUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  revalidatePath("/account/einstellungen");
  return { ok: true };
}

/** "Not now" — the fortnight timer, capped at three (spec §6.1). */
export async function dismissPromptAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const userId = await currentUserId();
  if (!userId) return { error: GENERIC_ERROR };

  try {
    await declineForUser(getDb(), { userId, context: consentContext() });
  } catch (err) {
    console.error("[newsletter] declineForUser failed:", err);
    return { error: GENERIC_ERROR };
  }

  revalidatePath("/account");
  return { ok: true };
}

/**
 * The second attempt on /registrieren/erfolg. Reads the account out of the
 * httpOnly cookie — never out of the request — and writes a `pending` row that
 * the pending verification mail will confirm (§3.3). The cookie is spent
 * either way, so the offer is made exactly once.
 */
export async function subscribeAfterRegistrationAction(
  _prev: NewsletterActionState,
  _formData: FormData,
): Promise<NewsletterActionState> {
  if (!newsletterEnabled()) return { error: GENERIC_ERROR };
  bootNewsletter();

  const signup = readSignupCookie();
  clearSignupCookie();
  if (!signup) return { error: GENERIC_ERROR };

  try {
    await subscribeAtRegistration(getDb(), {
      userId: signup.userId,
      email: signup.email,
      source: "registrierung_erfolg",
      sourcePath: "/registrieren/erfolg",
      context: consentContext(),
    });
  } catch (err) {
    console.error("[newsletter] subscribeAtRegistration failed:", err);
    return { error: GENERIC_ERROR };
  }

  return { ok: true };
}
```

- [ ] **Step 3: Typecheck und Lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_newsletter/actions.ts apps/web/app/_newsletter/signup-cookie.ts
git commit -m "feat(newsletter): server actions and the registration signup cookie"
```

---

### Task 14: B1 — der Schalter auf `/account/einstellungen`

**Files:**

- Create: `apps/web/app/_newsletter/NewsletterToggle.tsx`
- Modify: `apps/web/app/account/einstellungen/page.tsx`

**Interfaces:**

- Consumes: `getSubscriptionForUser` (`@bdas/newsletter`), `subscribeMeAction`/`unsubscribeMeAction` (`./actions`).
- Produces: `<NewsletterToggle userId />` — Server Component.

B1 ist eine **Zeile mit Schalter in der bestehenden Sammelkarte**, keine eigene Karte. Die Karte „E-Mail-Benachrichtigungen" liegt dort bereits als gestrichelter Platzhalter mit dem Kommentar, dass ihre Position festgelegt ist, „damit das Ausliefern der Einstellungen ein Einfügen ist und kein Umbauen". Genau dieses Einfügen passiert hier — bei ausgeschaltetem Flag bleibt der Platzhalter unverändert stehen.

Der Schalter ist ein `<button role="switch">` in einem Formular, keine Checkbox: Er löst sofort eine Server Action aus, und `aria-checked` beschreibt das ehrlicher als eine Checkbox, die nichts absendet. Kein Client-JavaScript nötig — die Seite rendert nach der Action neu.

`pending` bekommt eine eigene Zeile: Der Schalter steht aus, darunter steht, dass noch eine Bestätigung aussteht. Ein „an" zu zeigen, wäre gelogen; ein „aus" ohne Erklärung ließe den Menschen erneut klicken.

- [ ] **Step 1: Komponente schreiben**

`apps/web/app/_newsletter/NewsletterToggle.tsx`:

```tsx
import { getDb } from "@bdas/db";
import { getSubscriptionForUser } from "@bdas/newsletter";

import { subscribeMeAction, unsubscribeMeAction } from "./actions";

/**
 * B1 — one row with a switch inside the existing settings card.
 *
 * The only surface in the platform that can turn the newsletter OFF
 * (spec §3.4). A server component: the switch posts a Server Action and the
 * page re-renders, so no client state is needed.
 */
export async function NewsletterToggle({ userId }: { userId: string }) {
  const sub = await getSubscriptionForUser(getDb(), userId);
  const on = sub?.status === "subscribed";
  const pending = sub?.status === "pending";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bdas-soft pt-4 first:border-0 first:pt-0">
      <div>
        <p id="newsletter-switch-label" className="font-medium text-bdas-ink">
          Newsletter
        </p>
        <p className="text-sm text-bdas-ink-body">
          {pending
            ? "Fast geschafft — bestätige noch den Link in deiner E-Mail."
            : "Ein paar Mal im Jahr: was im Verband ansteht und was wir vorhaben."}
        </p>
      </div>

      <form action={on ? unsubscribeMeAction : subscribeMeAction}>
        <input type="hidden" name="source" value="konto" />
        <input type="hidden" name="sourcePath" value="/account/einstellungen" />
        <button
          type="submit"
          role="switch"
          aria-checked={on}
          aria-labelledby="newsletter-switch-label"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-bdas-full
            transition-colors duration-bdas-quick ease-bdas
            focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-red/40
            ${on ? "bg-bdas-red" : "bg-bdas-overlay-hover"}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-bdas-full bg-bdas-surface shadow-bdas-card
              transition-transform duration-bdas-quick ease-bdas
              ${on ? "translate-x-[22px]" : "translate-x-[2px]"}`}
          />
        </button>
      </form>
    </div>
  );
}
```

Sollte eine der Utilities (`bg-bdas-overlay-hover`, `shadow-bdas-card`, `ease-bdas`) im Preset anders heißen, wird der **Preset-Name** verwendet — kein Inline-Wert und kein neuer Token (CLAUDE.md §7).

- [ ] **Step 2: In die reservierte Karte einsetzen**

`apps/web/app/account/einstellungen/page.tsx` — den Platzhalterblock ersetzen durch:

```tsx
      {newsletterEnabled() ? (
        <Card flat className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-bdas-ink">E-Mail-Benachrichtigungen</h2>
          <NewsletterToggle userId={me.user.id} />
        </Card>
      ) : (
        /* Reserved. Position and name are fixed now so that shipping the
           preferences is an insert, not a rearrangement. Not a control: it is
           inert and announces itself as unavailable. */
        <Card flat className="border-dashed p-6" aria-disabled="true">
          … unverändert …
        </Card>
      )}
```

plus die Importe `newsletterEnabled` (`../../_newsletter/flag`) und `NewsletterToggle` (`../../_newsletter/NewsletterToggle`).

- [ ] **Step 3: Ansehen**

Run: `pnpm dev` und `/account/einstellungen` mit `BDAS_FLAG_NEWSLETTER=true` aufrufen
Expected: Die Karte ist live, der Schalter kippt beim Klick und bleibt nach dem Neuladen stehen. Ohne Flag steht der gestrichelte Platzhalter unverändert.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_newsletter/NewsletterToggle.tsx apps/web/app/account/einstellungen/page.tsx
git commit -m "feat(newsletter): account switch in the notifications card"
```

---

### Task 15: C1 — der Hinweis-Banner auf `/account`

**Files:**

- Create: `apps/web/app/_newsletter/NewsletterPrompt.tsx`
- Modify: `apps/web/app/account/page.tsx`

**Interfaces:**

- Consumes: `shouldPrompt` (`@bdas/newsletter`), `subscribeMeAction`/`dismissPromptAction` (`./actions`).
- Produces: `<NewsletterPrompt />` — Client Component.

C1 ist der Banner über dem Inhalt, direkt unter der Begrüßung, in der Gestalt H1: volle Fläche Markenrot, weiße Schrift, weißer Knopf. Er ist laut, weil er der größte Einzelhebel ist (§6): Diese Adressen sind bereits verifiziert.

Client-Komponente, obwohl der Schalter in Task 14 ohne auskommt — hier braucht es die vier Zustände aus §13.2. Zwischen Klick und erneutem Rendern muss „Wird eingetragen …" stehen, und der Erfolgssatz „Du bist dabei" will einen Moment lesbar sein, bevor der Banner verschwindet. Die Ergebnismeldung liegt in einer `aria-live="polite"`-Region (§13.4).

Die Fokusreihenfolge ist die des Markups: erst „Ja, ich bin dabei", dann „Später". Der Banner steht **nach** der h1 im DOM, kein `autofocus`, kein Fokusdiebstahl — er unterbricht die Seite optisch, nicht die Tastaturbedienung.

- [ ] **Step 1: Komponente schreiben**

`apps/web/app/_newsletter/NewsletterPrompt.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@bdas/design-system";

import { dismissPromptAction, subscribeMeAction, type NewsletterActionState } from "./actions";

const initial: NewsletterActionState = {};

function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="on-brand" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ja, ich bin dabei"}
    </Button>
  );
}

/**
 * C1 in the H1 shape (spec §13.3): the surface itself is the accent — full
 * brand red, ink.onBrand text, a white button. It stands out through the
 * colour change alone on an otherwise white page, so the entrance animation
 * is `motion-safe:` only and nothing is lost without it.
 */
export function NewsletterPrompt() {
  const [joined, join] = useFormState(subscribeMeAction, initial);
  const [, dismiss] = useFormState(dismissPromptAction, initial);

  return (
    <section
      className="rounded-bdas bg-bdas-red p-6 text-bdas-ink-on-brand shadow-bdas-card
        transition-shadow duration-bdas-soft ease-bdas
        motion-safe:animate-bdas-fade-slide-up"
      aria-labelledby="newsletter-prompt-title"
    >
      <h2 id="newsletter-prompt-title" className="text-lg font-semibold">
        Bleib auf dem Laufenden
      </h2>
      <p className="mt-1 max-w-prose text-sm">
        Ein paar Mal im Jahr schreiben wir dir, was im Verband ansteht. Du bist angemeldet, wir
        kennen deine Adresse — ein Klick genügt.
      </p>

      <div aria-live="polite" className="mt-2 text-sm">
        {joined.ok ? "Du bist dabei. Abschalten kannst du das jederzeit unter Mein Konto." : null}
        {joined.error ?? null}
      </div>

      {!joined.ok ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={join}>
            <input type="hidden" name="source" value="dashboard_hinweis" />
            <input type="hidden" name="sourcePath" value="/account" />
            <JoinButton />
          </form>
          <form action={dismiss}>
            <button
              type="submit"
              className="text-sm underline underline-offset-2 hover:opacity-80
                focus:outline-none focus-visible:ring-2 focus-visible:ring-bdas-ink-on-brand/60"
            >
              Später
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Auf `/account` einsetzen**

`apps/web/app/account/page.tsx` — direkt nach der h1 „Mein Konto" (beide Zweige des Layouts, Zeilen ~202 und ~212 der heutigen Fassung):

```tsx
{showNewsletterPrompt ? <NewsletterPrompt /> : null}
```

und weiter oben, bei den übrigen Abfragen:

```tsx
  // Gated by the flag helper, never by requireNewsletterFlag(): a notFound()
  // here would take the whole account page away over a side feature.
  const showNewsletterPrompt =
    newsletterEnabled() && me.user.id ? await shouldPrompt(db, me.user.id) : false;
```

Steht der Banner in beiden Layout-Zweigen doppelt im Markup, wird er stattdessen **einmal** oberhalb des Zweigs gerendert — die h1 kommt in beiden Zweigen vor, der Banner soll aber genau einmal erscheinen. Beim Einbau prüfen, welche der beiden Stellen der gemeinsame Elternknoten ist.

- [ ] **Step 3: Ansehen**

Run: `pnpm dev`, `/account` mit `BDAS_FLAG_NEWSLETTER=true`
Expected: Roter Banner unter der h1; „Ja, ich bin dabei" zeigt kurz „Wird eingetragen …", dann den Erfolgssatz; nach dem Neuladen ist der Banner weg und der Schalter unter `/account/einstellungen` steht an. „Später" lässt ihn verschwinden; nach drei Mal „Später" kommt er auch nach dem Neuladen nicht wieder.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_newsletter/NewsletterPrompt.tsx apps/web/app/account/page.tsx
git commit -m "feat(newsletter): dashboard prompt banner in the H1 brand field"
```

---

### Task 16: E2 — die Checkbox in `/registrieren`

**Files:**

- Modify: `apps/web/app/registrieren/RegistrierenForm.tsx`
- Modify: `apps/web/app/registrieren/page.tsx`
- Modify: `apps/web/app/registrieren/actions.ts`
- Test: `apps/web/app/registrieren/actions.test.ts` (vorhanden, erweitern)

**Interfaces:**

- Consumes: `subscribeAtRegistration` (`@bdas/newsletter`), `setSignupCookie` (`../_newsletter/signup-cookie`).
- Produces: Feld `newsletter` im Registrierungsformular.

E2: ein **abgesetzter Kasten** mit Nutzenzeile und Datenschutz-Verweis, Checkbox ungehakt. Rechtlich verbindlich (§6): nie vorausgewählt, nie an die Registrierung gekoppelt — das Konto entsteht mit und ohne Haken —, und daneben steht der Verweis auf `/datenschutz`.

**Die Registrierung darf niemals an der Newsletter-Zeile scheitern.** Derselbe Grund wie beim Bus-Handler: Ein Nebenfeature darf den Kernpfad nicht lahmlegen. Der ganze Block steckt in `try/catch` und protokolliert nur. Das `redirect()` steht außerhalb — Next implementiert `redirect()` als Wurf, ein umschließendes `catch` verschluckte die Weiterleitung.

Das Formular ist eine Client-Komponente und kann `isFlagOn` nicht selbst lesen; die Seite reicht `newsletterOn` als Prop herein.

- [ ] **Step 1: Kasten ins Formular**

`apps/web/app/registrieren/RegistrierenForm.tsx` — Prop `newsletterOn: boolean` ergänzen und nach der Einwilligungs-Checkbox einsetzen:

```tsx
      {newsletterOn ? (
        <div className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
          <label htmlFor="newsletter" className="flex items-start gap-2 text-sm text-bdas-ink-body">
            {/* Never pre-checked, never coupled to the registration (spec §6). */}
            <input id="newsletter" name="newsletter" type="checkbox" value="true" className="mt-1" />
            <span>
              <span className="font-medium text-bdas-ink">Schreibt mir auch den Newsletter.</span>{" "}
              Ein paar Mal im Jahr, was im Verband ansteht.
            </span>
          </label>
          <p className="mt-2 text-xs text-bdas-ink-muted">
            Abbestellen kannst du jederzeit unter „Mein Konto". Wie wir mit deinen Daten umgehen,
            steht im <a href={privacyUrl} className="underline">Datenschutzhinweis</a>.
          </p>
        </div>
      ) : null}
```

`apps/web/app/registrieren/page.tsx` — `newsletterOn={newsletterEnabled()}` an das Formular durchreichen.

- [ ] **Step 2: Action erweitern**

`apps/web/app/registrieren/actions.ts` — nach dem Versand der Verifizierungsmail, **vor** dem `redirect`:

```ts
  // A newsletter hiccup must never cost someone their account: log and move on.
  // Deliberately outside the redirect below — Next implements redirect() as a
  // throw, and an enclosing catch would swallow the navigation.
  if (newsletterEnabled()) {
    try {
      bootNewsletter();
      if (formData.get("newsletter") === "true") {
        await subscribeAtRegistration(getDb(), {
          userId: result.userId,
          email,
          source: "registrierung",
          sourcePath: "/registrieren",
          context: { ip },
        });
      } else {
        // Unticked: keep the address for the one softer second attempt on the
        // success page. Ticked means done — nobody gets asked twice (§6).
        setSignupCookie({ userId: result.userId, email: email.trim().toLowerCase() });
      }
    } catch (err) {
      console.error("[newsletter] registration signup failed:", err);
    }
  }

  redirect("/registrieren/erfolg");
```

- [ ] **Step 3: Tests erweitern**

`apps/web/app/registrieren/actions.test.ts` — zwei Fälle ergänzen:

1. Mit `newsletter=true` entsteht eine `pending`-Zeile mit `source = "registrierung"`, und **kein** Cookie wird gesetzt.
2. Ohne den Haken entsteht keine Zeile, aber das Cookie trägt Konto-Kennung und Adresse.
3. Wirft `subscribeAtRegistration`, wird trotzdem nach `/registrieren/erfolg` weitergeleitet und das Konto existiert.

Run: `pnpm vitest run apps/web/app/registrieren`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/registrieren
git commit -m "feat(newsletter): unticked checkbox in the registration form"
```

---

### Task 17: Der zweite Anlauf auf `/registrieren/erfolg`

**Files:**

- Create: `apps/web/app/_newsletter/NewsletterSecondAttempt.tsx`
- Modify: `apps/web/app/registrieren/erfolg/page.tsx`

**Interfaces:**

- Consumes: `readSignupCookie` (`../_newsletter/signup-cookie`), `subscribeAfterRegistrationAction` (`../_newsletter/actions`).

Weicher als E2 auf dem Formular: Die Person hat gerade ein Konto angelegt, das ist der falsche Moment für Lautstärke. Kein rotes Feld — H1 ist A3 und C1 vorbehalten (§13). Ein abgesetzter Kasten unter der Bestätigung, ein Satz, ein Knopf.

Der Kasten erscheint nur, wenn das Cookie da ist — also nur, wenn der Haken vorher **nicht** gesetzt war und die Registrierung höchstens 15 Minuten her ist. Nach dem Klick ist das Cookie verbraucht; ein Neuladen zeigt den Kasten nicht erneut.

Der Erfolgstext ist eine Variante von §13.2 „Öffentlich, Erfolg", angepasst an §3.3: Es geht **keine** zweite Mail raus, die bereits versandte Verifizierungsmail bestätigt beides.

- [ ] **Step 1: Komponente schreiben**

`apps/web/app/_newsletter/NewsletterSecondAttempt.tsx`:

```tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@bdas/design-system";

import { subscribeAfterRegistrationAction, type NewsletterActionState } from "./actions";

const initial: NewsletterActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? "Wird eingetragen …" : "Ja, gerne"}
    </Button>
  );
}

/**
 * The second, softer attempt (spec §6). Someone has just created an account —
 * the wrong moment to shout, so this is a quiet box and NOT the H1 brand
 * field, which stays reserved for A3 and C1.
 *
 * The address comes from the httpOnly cookie the register action set, never
 * from the request, and the cookie is spent on submit: the offer is made once.
 */
export function NewsletterSecondAttempt() {
  const [state, action] = useFormState(subscribeAfterRegistrationAction, initial);

  return (
    <section className="rounded-bdas border border-bdas-soft bg-bdas-overlay-faint p-4">
      <div aria-live="polite">
        {state.ok ? (
          <p className="text-sm text-bdas-ink-body">
            Du bist dabei. Die E-Mail, die schon unterwegs ist, bestätigt beides auf einmal.
          </p>
        ) : (
          <>
            <p className="text-sm text-bdas-ink-body">
              Willst du auch unseren Newsletter? Ein paar Mal im Jahr, was im Verband ansteht.
              Abbestellen jederzeit unter „Mein Konto".
            </p>
            {state.error ? <p className="mt-2 text-sm text-bdas-red">{state.error}</p> : null}
            <form action={action} className="mt-3">
              <SubmitButton />
            </form>
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Auf der Erfolgsseite einsetzen**

`apps/web/app/registrieren/erfolg/page.tsx` — nach dem `Alert`, vor dem „Keine E-Mail erhalten?"-Absatz:

```tsx
      {newsletterEnabled() && readSignupCookie() ? <NewsletterSecondAttempt /> : null}
```

- [ ] **Step 3: Ansehen**

Run: `pnpm dev`, mit `BDAS_FLAG_NEWSLETTER=true` einmal **ohne** Haken registrieren
Expected: Der Kasten steht auf der Erfolgsseite; „Ja, gerne" tauscht ihn gegen den Erfolgssatz; nach dem Neuladen ist er weg. Mit Haken registriert erscheint er gar nicht erst.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_newsletter/NewsletterSecondAttempt.tsx apps/web/app/registrieren/erfolg/page.tsx
git commit -m "feat(newsletter): softer second attempt on the registration success page"
```

---

### Task 18: E2E-Abnahme und PR-2-Abschluss

**Files:**

- Create: `e2e/newsletter.e2e.ts`
- Modify: `e2e/helpers/flows.ts`

**Interfaces:**

- Consumes: `registerVerifyLogin`, `register`, `verify`, `login` (`./helpers/flows`), `deleteUserByEmail` (`./helpers/db`).

Der Lauf deckt die drei Behauptungen ab, die dieser PR aufstellt: Der Haken bei der Registrierung landet über `auth.user.verified` auf `subscribed`; ohne Haken erscheint der Banner und lässt sich mit einem Klick beantworten; abgeschaltet wird nur unter „Mein Konto".

**Gotcha vor jedem lokalen E2E-Lauf:** `pnpm e2e` testet, was auch immer auf Port 3000 lauscht — unter Umständen ein zwei Tage alter Build aus einem anderen Worktree. Vor jedem Fehlerbericht `lsof -i :3000` prüfen.

- [ ] **Step 1: Helfer um den Haken erweitern**

`e2e/helpers/flows.ts` — `register(page, opts)` um ein optionales Feld ergänzen:

```ts
  opts: { email: string; firstName?: string; lastName?: string; password?: string; newsletter?: boolean },
```

und vor dem Absenden:

```ts
  // Behind the `newsletter` flag the box may not be rendered at all.
  if (opts.newsletter === true) await page.locator("#newsletter").check();
```

- [ ] **Step 2: E2E schreiben**

`e2e/newsletter.e2e.ts`:

```ts
/**
 * Newsletter PR 2 — the signed-in surfaces (spec §12 no. 2).
 *  - Ticking the box during registration lands as `subscribed` once the
 *    platform's own verification mail is clicked: no second mail, the
 *    `auth.user.verified` handler does it (§3.3).
 *  - Without the tick the account sees the prompt banner on /account and can
 *    answer it in one click.
 *  - Turning it off works only under "Mein Konto" (§3.4).
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

const unique = () => `nl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.org`;

test.describe("newsletter, signed-in surfaces", () => {
  test("the registration tick becomes a subscription after verification", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email, newsletter: true });

      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);

      await page.goto("/account/einstellungen");
      await expect(page.getByRole("switch", { name: "Newsletter" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("without the tick the banner appears and one click answers it", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email });

      await page.goto("/account");
      const banner = page.getByRole("heading", { name: "Bleib auf dem Laufenden" });
      await expect(banner).toBeVisible();

      await page.getByRole("button", { name: "Ja, ich bin dabei" }).click();
      await expect(page.getByText("Du bist dabei.")).toBeVisible();

      await page.reload();
      await expect(banner).toHaveCount(0);

      await page.goto("/account/einstellungen");
      await expect(page.getByRole("switch", { name: "Newsletter" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("dismissing keeps the banner away for the rest of the session", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email });

      await page.goto("/account");
      await page.getByRole("button", { name: "Später" }).click();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("turning it off happens only under Mein Konto", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email, newsletter: true });

      await page.goto("/account/einstellungen");
      const sw = page.getByRole("switch", { name: "Newsletter" });
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "false");

      // And nothing re-asks: an explicit no is an answer, not a gap (§6.1).
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
```

- [ ] **Step 3: E2E laufen lassen**

Run: `lsof -i :3000` (muss leer sein oder der eigene Server) — dann `BDAS_FLAG_NEWSLETTER=true pnpm e2e newsletter`
Expected: PASS (4 Specs)

- [ ] **Step 4: Volllauf**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/newsletter.e2e.ts e2e/helpers/flows.ts
git commit -m "test(e2e): cover the signed-in newsletter surfaces"
```

- [ ] **Step 6: PR 2 abnehmen**

Prüfliste, alles muss zutreffen:

- `pnpm vitest run && pnpm typecheck && pnpm lint` grün; `pnpm e2e newsletter` grün mit gesetztem Flag.
- Kein Inline-Hex, -Radius, -Schatten, keine Inline-Dauer in den neuen Komponenten: `grep -rnE "#[0-9a-fA-F]{3,6}|[0-9]+ms" apps/web/app/_newsletter` liefert nichts.
- Keine Fläche außer `/account/einstellungen` kann abschalten.
- Bei ausgeschaltetem Flag ist `/account`, `/account/einstellungen` und `/registrieren` exakt wie vorher — insbesondere steht der gestrichelte Platzhalter wieder da.
- Die Checkbox in `/registrieren` ist nie vorausgewählt, und eine Registrierung mit fehlschlagendem Newsletter-Pfad legt das Konto trotzdem an.
- Kein `?email=` irgendwo im Newsletter-Code: `grep -rn "email=" apps/web/app/_newsletter` liefert nichts.
- Kein E-Mail-Versand aus diesem PR — `newsletter.confirmation_requested` hat noch keinen Abonnenten, das ist PR 3.

---

## Was danach kommt

- **PR 3 — Öffentliche Erfassung:** Vorlagen `newsletter_confirm` und `newsletter_already_subscribed` in `modules/notifications`, Bestätigungs- und Abmelderoute, Drosselung, Honeypot, Footer (A3) und `/newsletter`. Zusätzlich `/security-review` und die Fortschreibung von `/datenschutz` samt `docs/datenschutz/` (siehe ADR 0035).
- **PR 4 — Offensive Flächen:** Blogartikel-Ende, Puck-Block, Scroll-Panel (D2), Checkbox in der Event-Gastanmeldung.
- **PR 5 — Board-Ansicht:** `/federal/newsletter` mit Liste, Kennzahlen, Filter und CSV-Export. **Vorbedingung:** ein Stapelleser `getUserEmails(db, ids)` in `@bdas/auth`, sonst wird der Resolver aus Task 12 zum N+1.
