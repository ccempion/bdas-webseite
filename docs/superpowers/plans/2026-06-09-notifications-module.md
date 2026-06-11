# `notifications` Module (Core Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `notifications` module's first slice — subscribe to the `events` module's bus events and send the corresponding transactional emails, logging every send for audit.

**Architecture:** A new business module `@bdas/notifications` owns one table (`notification_log`). It exposes a `sendTransactional` service and a `registerNotificationSubscribers()` wiring function that subscribes to the in-process event bus (`@bdas/events`). Following the existing `auth` pattern, outbound email goes through a composition-time `Notifier` interface (console default + Resend driver). Because email lives in `auth` and member identity in `members` (rule 1), the module depends on a composition-time `RecipientResolver` interface — the app wires it from `members.getMember` + `auth.getUserExport`, so `notifications` never reads another module's tables. Auth keeps its own verify/reset Notifier unchanged (decision: leave auth as-is).

**Tech Stack:** TypeScript, Drizzle ORM (postgres-js), `@bdas/events` (in-process bus), `resend`, Vitest with real Postgres (per-test schema reset via `@bdas/db/test`).

---

## Scope

**In scope (this PR):** the three member-scoped events that already carry a single `memberId`:

| Bus event                                      | Transactional email      |
| ---------------------------------------------- | ------------------------ |
| `events.event.registered` (`waitlisted=false`) | Anmeldung bestätigt      |
| `events.event.registered` (`waitlisted=true`)  | Auf der Warteliste       |
| `events.event.deregistered`                    | Abmeldung bestätigt      |
| `events.waitlist.promoted`                     | Nachgerückt — Platz frei |

**Deferred (later PRs):**

- `events.event.published` / `events.event.cancelled` — these are group-wide, not single-recipient. Fanning out to all registrants needs `events` to expose a registrant-list service or emit per-registrant events (rule 1: `notifications` cannot read `event_registrations`). Belongs in the broadcast PR.
- `broadcastToGroup` / `broadcastFederal` (§16) and per-user preferences — second PR.
- Reconciling auth's verify/reset email into `notifications` — noted as a future ADR; out of scope by decision.

**Why this slice:** `modules/events/src/events.ts` already emits these events with "no consumer yet." This PR makes the events module's registration/waitlist flows actually reach members — the highest user-value gap in Phase 2.

---

## File Structure

```
modules/notifications/
  package.json                 # @bdas/notifications, workspace deps
  tsconfig.json                # extends repo base, mirrors modules/events
  README.md                    # public surface, owned table, deferred list
  migrations/
    0001_init.sql              # notification_log table
  src/
    index.ts                   # public surface (rule 8) — only re-exports here are visible
    schema.ts                  # drizzle table: notificationLog
    types.ts                   # TransactionalTemplate, SendResult, RecipientContact
    notifier.ts                # Notifier interface + consoleNotifier + get/setNotifier
    notifier-resend.ts         # Resend driver (createResendNotifier)
    resolver.ts                # RecipientResolver interface + get/setRecipientResolver
    templates.ts               # render(template, data) -> { subject, text, html }
    services/
      send.ts                  # sendTransactional(db, template, toMemberId, data, eventId?)
    subscribers.ts             # registerNotificationSubscribers() — bus wiring
    index.test.ts              # Postgres integration test (no DB mocks, per §4)
    templates.test.ts          # pure render unit tests (no DB)
apps/web/lib/
  notifications-bootstrap.ts   # composition: wire Notifier + RecipientResolver, gate by flag
```

**Manifest:** `infra/migrations/src/manifest.ts` already lists `notifications` (between `members` and `events`) — no edit needed; verify in Task 9. **Feature flag:** `notifications` already exists in `core/feature-flags` — no edit needed.

---

### Task 1: Scaffold the module package

**Files:**

- Create: `modules/notifications/package.json`
- Create: `modules/notifications/tsconfig.json`
- Create: `modules/notifications/src/index.ts`

- [ ] **Step 1: Write `package.json`**

Model it on `modules/events/package.json` (note: name is `@bdas/notifications`, NOT suffixed — there is no `core/notifications` collision, unlike events).

```json
{
  "name": "@bdas/notifications",
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
    "@bdas/events-module": "workspace:*",
    "@bdas/id": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "resend": "^4.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "tsx": "^4.19.1"
  }
}
```

> Note: `@bdas/events-module` is depended on only for its **event type** re-exports (`EventRegistered` etc.) — a types-only dependency, allowed under rule 2. Confirm the `resend` version matches `modules/auth/package.json` before finalizing; copy whatever version auth pins.

- [ ] **Step 2: Write `tsconfig.json`** — copy `modules/events/tsconfig.json` verbatim (same compiler settings, same `extends`).

- [ ] **Step 3: Write a placeholder `src/index.ts`**

```ts
/**
 * @bdas/notifications — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files are not importable.
 *
 * Outbound communication: subscribes to module bus events (@bdas/events) and
 * sends transactional email through a composition-time Notifier. Owns the
 * `notification_log` table only.
 */

export {}; // populated as services land; final surface defined in Task 8
```

- [ ] **Step 4: Install workspace links**

Run: `pnpm install`
Expected: completes without error; `@bdas/notifications` is linked into the workspace.

- [ ] **Step 5: Typecheck the empty package**

Run: `pnpm --filter @bdas/notifications typecheck`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add modules/notifications/package.json modules/notifications/tsconfig.json modules/notifications/src/index.ts pnpm-lock.yaml
git commit -m "chore(notifications): scaffold module package"
```

---

### Task 2: Owned table — `notification_log` schema + migration

**Files:**

- Create: `modules/notifications/migrations/0001_init.sql`
- Create: `modules/notifications/src/schema.ts`

- [ ] **Step 1: Write the migration**

Model the FK and id style on `modules/events/migrations/0001_init.sql` (`text PRIMARY KEY`, `text REFERENCES members(id)`, `timestamptz ... DEFAULT now()`). Runs after `members` per the manifest, so the FK target exists.

```sql
-- Notifications module — initial schema (spec §16, Phase 2 core slice).
-- Owns: notification_log.
-- FKs into members(id) (DB-level reference, same pattern as events → members).
-- Runs after members per the infra/migrations manifest.

CREATE TABLE notification_log (
  id          text PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  channel     text NOT NULL DEFAULT 'email',
  template    text NOT NULL,
  to_email    text NOT NULL,
  subject     text NOT NULL,
  status      text NOT NULL,            -- 'sent' | 'failed'
  error       text,                     -- failure detail when status = 'failed'
  event_id    text,                     -- optional correlation to the source bus event
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_log_status_chk CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX notification_log_member_idx ON notification_log (member_id);
CREATE INDEX notification_log_created_idx ON notification_log (created_at);
```

- [ ] **Step 2: Write the Drizzle table** mirroring the SQL exactly

```ts
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The only table this module owns (CLAUDE.md §1 rule 1). Every transactional
 * send writes one row here for audit; the dashboard app surfaces it later.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    channel: text("channel").notNull().default("email"),
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    eventId: text("event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("notification_log_member_idx").on(t.memberId),
    createdIdx: index("notification_log_created_idx").on(t.createdAt),
  }),
);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/notifications typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/notifications/migrations/0001_init.sql modules/notifications/src/schema.ts
git commit -m "feat(notifications): notification_log table + migration"
```

---

### Task 3: `Notifier` interface + console default + Resend driver

**Files:**

- Create: `modules/notifications/src/notifier.ts`
- Create: `modules/notifications/src/notifier-resend.ts`

This mirrors `modules/auth/src/notifier.ts` and `notifier-resend.ts`, but the message is a fully-rendered email (subject/text/html already produced by `templates.ts`), since `notifications` renders many templates rather than two fixed kinds.

- [ ] **Step 1: Write `notifier.ts`**

```ts
/**
 * Outbound email for notifications. The interface is the public contract; the
 * app composes a concrete driver at boot (see notifier-resend.ts). For tests
 * and dev without RESEND_API_KEY, `consoleNotifier` writes to stdout.
 *
 * Unlike auth's Notifier (two fixed message kinds), this carries an
 * already-rendered email — templates.ts produces subject/text/html.
 */

export type OutboundEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

export interface Notifier {
  send(email: OutboundEmail): Promise<void>;
}

export const consoleNotifier: Notifier = {
  async send(email: OutboundEmail): Promise<void> {
    console.log(`[notifications] → ${email.to}: ${email.subject}`);
  },
};

let _notifier: Notifier = consoleNotifier;

export function getNotifier(): Notifier {
  return _notifier;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setNotifier(n: Notifier): void {
  _notifier = n;
}
```

- [ ] **Step 2: Write `notifier-resend.ts`** (copy the structure of `modules/auth/src/notifier-resend.ts`)

```ts
/**
 * Resend driver for the Notifier interface. Composition wires it in apps/web
 * if RESEND_API_KEY is set; otherwise consoleNotifier is used.
 */
import { Resend } from "resend";

import type { Notifier, OutboundEmail } from "./notifier";

export type ResendNotifierOptions = {
  readonly apiKey: string;
  readonly from: string;
};

export function createResendNotifier(opts: ResendNotifierOptions): Notifier {
  const client = new Resend(opts.apiKey);
  return {
    async send(email: OutboundEmail): Promise<void> {
      await client.emails.send({
        from: opts.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    },
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bdas/notifications typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/notifications/src/notifier.ts modules/notifications/src/notifier-resend.ts
git commit -m "feat(notifications): Notifier interface + console + Resend driver"
```

---

### Task 4: Templates (TDD)

**Files:**

- Create: `modules/notifications/src/types.ts`
- Create: `modules/notifications/src/templates.ts`
- Test: `modules/notifications/src/templates.test.ts`

- [ ] **Step 1: Write `types.ts`** (the template union + render input + the contact shape used in Task 5)

```ts
/**
 * Public types for the notifications module.
 */

/** The transactional emails this slice can send. */
export type TransactionalTemplate =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_deregistration_confirmed"
  | "event_waitlist_promoted";

/** Data interpolated into a transactional template. */
export type TemplateData = {
  /** Recipient's given name for the salutation. */
  readonly firstName: string;
  /** Human-readable event title. */
  readonly eventTitle: string;
};

/** Outcome of a send attempt, returned by sendTransactional. */
export type SendResult = {
  readonly status: "sent" | "failed";
  readonly logId: string;
};

/** Recipient identity resolved at composition time (see resolver.ts). */
export type RecipientContact = {
  readonly email: string;
  readonly firstName: string;
};
```

- [ ] **Step 2: Write the failing render test**

```ts
import { describe, expect, it } from "vitest";

import { render } from "./templates";

describe("render", () => {
  const data = { firstName: "Mara", eventTitle: "Sommerfest" };

  it("registration confirmation greets by name and names the event", () => {
    const out = render("event_registration_confirmed", data);
    expect(out.subject).toContain("Anmeldung");
    expect(out.text).toContain("Mara");
    expect(out.text).toContain("Sommerfest");
    expect(out.html).toContain("Sommerfest");
  });

  it("waitlist notice differs from confirmation", () => {
    const confirmed = render("event_registration_confirmed", data);
    const waitlisted = render("event_waitlisted", data);
    expect(waitlisted.subject).not.toEqual(confirmed.subject);
    expect(waitlisted.subject).toContain("Warteliste");
  });

  it("promotion notice signals a freed seat", () => {
    const out = render("event_waitlist_promoted", data);
    expect(out.subject).toContain("Platz");
    expect(out.text).toContain("Sommerfest");
  });

  it("deregistration confirmation acknowledges cancellation", () => {
    const out = render("event_deregistration_confirmed", data);
    expect(out.subject).toContain("Abmeldung");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts`
Expected: FAIL — `render` is not defined / module not found.

- [ ] **Step 4: Write `templates.ts`**

```ts
import type { TemplateData, TransactionalTemplate } from "./types";

export type RenderedEmail = {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

/** German transactional copy. One entry per TransactionalTemplate. */
export function render(template: TransactionalTemplate, data: TemplateData): RenderedEmail {
  const { firstName, eventTitle } = data;
  switch (template) {
    case "event_registration_confirmed":
      return body(
        "BDAS — Anmeldung bestätigt",
        firstName,
        `deine Anmeldung für „${eventTitle}“ ist bestätigt. Wir freuen uns auf dich!`,
      );
    case "event_waitlisted":
      return body(
        "BDAS — Auf der Warteliste",
        firstName,
        `„${eventTitle}“ ist aktuell ausgebucht. Du stehst auf der Warteliste und rückst automatisch nach, sobald ein Platz frei wird.`,
      );
    case "event_deregistration_confirmed":
      return body(
        "BDAS — Abmeldung bestätigt",
        firstName,
        `deine Abmeldung von „${eventTitle}“ ist eingegangen. Schade, dass es nicht klappt — vielleicht beim nächsten Mal.`,
      );
    case "event_waitlist_promoted":
      return body(
        "BDAS — Platz frei geworden",
        firstName,
        `gute Nachrichten: Bei „${eventTitle}“ ist ein Platz frei geworden und du bist nachgerückt. Deine Teilnahme ist jetzt bestätigt.`,
      );
  }
}

function body(subject: string, firstName: string, line: string): RenderedEmail {
  const text = `Hallo ${firstName},\n\n${line}\n\nViele Grüße\nDein BDAS-Team\n`;
  const html =
    `<p>Hallo ${firstName},</p>` + `<p>${line}</p>` + `<p>Viele Grüße<br>Dein BDAS-Team</p>`;
  return { subject, text, html };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add modules/notifications/src/types.ts modules/notifications/src/templates.ts modules/notifications/src/templates.test.ts
git commit -m "feat(notifications): transactional templates (DE) + render tests"
```

---

### Task 5: `RecipientResolver` interface + composition hook

**Files:**

- Create: `modules/notifications/src/resolver.ts`

Email lives in `auth`, member identity in `members` (rule 1). The module must not read either module's tables. It depends on a composition-time interface that the app wires from public services. This mirrors the `getNotifier`/`setNotifier` pattern.

- [ ] **Step 1: Write `resolver.ts`**

```ts
/**
 * Resolves a memberId to the contact details needed to send email. Email is
 * owned by `auth` and identity by `members` (CLAUDE.md §1 rule 1), so this
 * module depends on a composition-time interface rather than reading those
 * tables. apps/web wires the concrete resolver at boot from members.getMember
 * + auth.getUserExport.
 */
import type { Db } from "@bdas/db";

import type { RecipientContact } from "./types";

export interface RecipientResolver {
  resolve(db: Db, memberId: string): Promise<RecipientContact | null>;
}

const unconfigured: RecipientResolver = {
  async resolve(): Promise<RecipientContact | null> {
    // No resolver wired (e.g. flag off, or boot skipped). Treat as "cannot
    // resolve" so sends are skipped rather than throwing.
    return null;
  },
};

let _resolver: RecipientResolver = unconfigured;

export function getRecipientResolver(): RecipientResolver {
  return _resolver;
}

/** Composition-time wiring. apps/web calls this at boot. */
export function setRecipientResolver(r: RecipientResolver): void {
  _resolver = r;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bdas/notifications typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add modules/notifications/src/resolver.ts
git commit -m "feat(notifications): RecipientResolver interface + composition hook"
```

---

### Task 6: `sendTransactional` service + integration test

**Files:**

- Create: `modules/notifications/src/services/send.ts`
- Test: `modules/notifications/src/index.test.ts` (created here; extended in Task 7)

- [ ] **Step 1: Write `services/send.ts`**

```ts
import type { Db } from "@bdas/db";
import { createId } from "@bdas/id";

import { getNotifier } from "../notifier";
import { getRecipientResolver } from "../resolver";
import { notificationLog } from "../schema";
import { render } from "../templates";
import type { SendResult, TemplateData, TransactionalTemplate } from "../types";

/**
 * Resolve the recipient, render the template, send via the composed Notifier,
 * and write one audit row. Transactional mail is non-optional (spec §16), so
 * no preference check. Returns the outcome; never throws on a send failure —
 * the failure is logged so a thrown subscriber cannot roll back the producer's
 * transaction (the bus runs handlers synchronously).
 *
 * `extra.eventTitle` supplies the event name for the template; callers that
 * have it (the subscribers) pass it so the service stays free of cross-module
 * reads. `eventId` is stored for correlation only.
 */
export async function sendTransactional(
  db: Db,
  template: TransactionalTemplate,
  toMemberId: string,
  extra: { readonly eventTitle: string; readonly eventId?: string },
): Promise<SendResult | null> {
  const contact = await getRecipientResolver().resolve(db, toMemberId);
  if (!contact) return null; // unresolvable recipient — nothing to send, nothing to log

  const data: TemplateData = { firstName: contact.firstName, eventTitle: extra.eventTitle };
  const email = render(template, data);
  const id = createId("ntfy");

  let status: "sent" | "failed" = "sent";
  let error: string | null = null;
  try {
    await getNotifier().send({ to: contact.email, ...email });
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  await db.insert(notificationLog).values({
    id,
    memberId: toMemberId,
    channel: "email",
    template,
    toEmail: contact.email,
    subject: email.subject,
    status,
    error,
    eventId: extra.eventId ?? null,
  });

  return { status, logId: id };
}
```

- [ ] **Step 2: Write the failing integration test** (harness copied from `modules/events/src/index.test.ts` — same `createTestDb`, same migration-applying loop, same `dbReachable` skip guard)

```ts
/**
 * Notifications integration tests against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable; CI brings up a Postgres service.
 *
 * Applies auth + groups + members + notifications migrations (notification_log
 * FKs into members). Uses a fake Notifier + RecipientResolver so no real email
 * is sent and no other module's tables are touched.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";

import { setNotifier, type OutboundEmail } from "./notifier";
import { setRecipientResolver } from "./resolver";
import { notificationLog } from "./schema";
import { sendTransactional } from "./services/send";
import type { RecipientContact } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = "postgres://bdas:bdas@localhost:5432/bdas";

async function dbReachable(): Promise<boolean> {
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

const reachable = await dbReachable();
const describeIfDb = reachable ? describe : describe.skip;

/** Insert the minimal auth_user + member rows the FK chain needs. */
async function seedMember(t: TestDb): Promise<string> {
  const userId = "usr_test_1";
  const memberId = "mbr_test_1";
  await t.db.execute(
    // raw SQL keeps the seed independent of other modules' service code
    // (columns mirror auth/members 0001_init.sql).
    // eslint-disable-next-line no-restricted-syntax
    (await import("drizzle-orm")).sql`
      INSERT INTO auth_users (id, email_normalized, email_display, status)
      VALUES (${userId}, 'mara@example.org', 'Mara@example.org', 'active');
      INSERT INTO members (id, user_id, first_name, last_name, status)
      VALUES (${memberId}, ${userId}, 'Mara', 'Beispiel', 'active');
    `,
  );
  return memberId;
}

describeIfDb("notifications integration", () => {
  let t: TestDb;
  let sent: OutboundEmail[];

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "notifications", "migrations", "0001_init.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, ...file), "utf8");
      await t.db.execute((await import("drizzle-orm")).sql.raw(sql));
    }

    sent = [];
    setNotifier({
      async send(email): Promise<void> {
        sent.push(email);
      },
    });
    setRecipientResolver({
      async resolve(): Promise<RecipientContact | null> {
        return { email: "mara@example.org", firstName: "Mara" };
      },
    });
  });

  afterEach(async () => {
    await t.cleanup();
  });

  it("sends a confirmation email and writes a 'sent' log row", async () => {
    const memberId = await seedMember(t);

    const result = await sendTransactional(t.db, "event_registration_confirmed", memberId, {
      eventTitle: "Sommerfest",
      eventId: "evt_1",
    });

    expect(result?.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Anmeldung");

    const rows = await t.db.select().from(notificationLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("sent");
    expect(rows[0]?.toEmail).toBe("mara@example.org");
    expect(rows[0]?.eventId).toBe("evt_1");
  });

  it("records a 'failed' row when the Notifier throws, without rethrowing", async () => {
    const memberId = await seedMember(t);
    setNotifier({
      async send(): Promise<void> {
        throw new Error("resend down");
      },
    });

    const result = await sendTransactional(t.db, "event_waitlisted", memberId, {
      eventTitle: "Sommerfest",
    });

    expect(result?.status).toBe("failed");
    const rows = await t.db.select().from(notificationLog);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.error).toContain("resend down");
  });
});
```

> Note: confirm the exact `TestDb` cleanup method name (`t.cleanup()` vs the field used in `modules/events/src/index.test.ts`) and the raw-SQL execution idiom by reading that file before writing this test; match it exactly rather than the sketch above. The auth/members seed column names (`email_normalized`, `email_display`, `user_id`, `first_name`, `last_name`, `status`) are taken from `modules/auth/src/schema.ts` and `modules/members/src/schema.ts` — re-verify against those migrations.

- [ ] **Step 3: Run the test to verify it fails (or skips if no DB)**

Run: `pnpm --filter @bdas/notifications exec vitest run src/index.test.ts`
Expected: With Postgres up → FAIL (service wiring incomplete or assertion mismatch on first write). Without Postgres → SKIP. Bring Postgres up locally with the same `DATABASE_URL` the events test uses.

- [ ] **Step 4: Make it pass** — fix any column/idiom mismatches surfaced in Step 3 against the real migrations. Re-run until PASS.

Run: `pnpm --filter @bdas/notifications exec vitest run src/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add modules/notifications/src/services/send.ts modules/notifications/src/index.test.ts
git commit -m "feat(notifications): sendTransactional service + integration tests"
```

---

### Task 7: Bus subscribers + integration test

**Files:**

- Create: `modules/notifications/src/subscribers.ts`
- Modify: `modules/notifications/src/index.test.ts` (add a "via bus" case)

- [ ] **Step 1: Write `subscribers.ts`**

The events module's events carry `memberId` and `eventId` but NOT the event title (see `modules/events/src/events.ts`). The handler must fetch the title without reading the `events` table directly (rule 1) — it calls the `events` module's public `getEvent` service. `getEvent` is viewer-scoped; pass a manager/system viewer that can always read. Re-check `getEvent`'s signature in `modules/events/src/services/get.ts` before wiring; if a system read is awkward, fall back to passing a minimal title via a follow-up event-field addition (note it, do not read the table).

```ts
/**
 * Wires this module to the in-process event bus. Subscribes to the three
 * member-scoped events the `events` module emits and sends the matching
 * transactional email. Idempotent: safe to call once per process at boot.
 *
 * Handlers must not throw — the bus runs them synchronously inside the
 * producer's flow (core/events), and sendTransactional already swallows send
 * failures into a logged 'failed' row.
 */
import { getDb } from "@bdas/db";
import { getEventBus, type Subscription } from "@bdas/events";
import type { EventDeregistered, EventRegistered, WaitlistPromoted } from "@bdas/events-module";

import { getEvent, type Viewer } from "../node_modules/@bdas/events-module"; // see note: import from package root, not deep path
import { sendTransactional } from "./services/send";

// A read-everything viewer for system-initiated lookups. Confirm field shape
// against modules/events/src/services/get.ts (Viewer type).
const SYSTEM_VIEWER: Viewer = {
  isActiveMember: true,
  memberGroupIds: [],
  isFederal: true,
  boardGroupIds: [],
};

async function eventTitle(eventId: string): Promise<string> {
  const ev = await getEvent(getDb(), eventId, SYSTEM_VIEWER);
  return ev?.title ?? "deine Veranstaltung";
}

let subs: Subscription[] = [];

export function registerNotificationSubscribers(): void {
  if (subs.length > 0) return; // idempotent

  const bus = getEventBus();

  subs.push(
    bus.subscribe<EventRegistered>("events.event.registered", async (e) => {
      const title = await eventTitle(e.eventId);
      await sendTransactional(
        getDb(),
        e.waitlisted ? "event_waitlisted" : "event_registration_confirmed",
        e.memberId,
        { eventTitle: title, eventId: e.eventId },
      );
    }),
    bus.subscribe<EventDeregistered>("events.event.deregistered", async (e) => {
      const title = await eventTitle(e.eventId);
      await sendTransactional(getDb(), "event_deregistration_confirmed", e.memberId, {
        eventTitle: title,
        eventId: e.eventId,
      });
    }),
    bus.subscribe<WaitlistPromoted>("events.waitlist.promoted", async (e) => {
      const title = await eventTitle(e.eventId);
      await sendTransactional(getDb(), "event_waitlist_promoted", e.memberId, {
        eventTitle: title,
        eventId: e.eventId,
      });
    }),
  );
}

/** Test helper: tear down subscriptions so a fresh bus starts clean. */
export function unregisterNotificationSubscribers(): void {
  for (const s of subs) s.unsubscribe();
  subs = [];
}
```

> **Import fix:** the `getEvent`/`Viewer` import above shows a placeholder path. The correct import is `import { getEvent, type Viewer } from "@bdas/events-module";` — use the package root (rule 8/no-deep-imports). Replace the placeholder line accordingly. Both `getEvent` and `Viewer` are confirmed re-exported from `modules/events/src/index.ts`.

> **`getDb()` in tests:** `sendTransactional` and `eventTitle` call `getDb()` (the process singleton), but the integration test uses a throwaway schema `t.db`. For the bus test, either (a) point `getDb()` at the test schema via the db module's test seam, or (b) keep the subscriber test as a focused unit test that stubs `getEvent` and asserts `sendTransactional` is invoked with the right template. Prefer (b): subscribe with the real bus, publish an event, and assert the fake Notifier captured the expected subject — using `setRecipientResolver` + `setNotifier` as in Task 6, and a `getDb` bound to `t.db`. Confirm how `@bdas/db` exposes a test override (mirror whatever `modules/events/src/index.test.ts` does for services that call `getDb()` internally; if events services take an explicit `db` param instead, note that `subscribers.ts` using `getDb()` is the one place that needs the seam).

- [ ] **Step 2: Add the failing "via bus" test** to `index.test.ts`

```ts
import { getEventBus, resetEventBus } from "@bdas/events";

import { registerNotificationSubscribers, unregisterNotificationSubscribers } from "./subscribers";

// ... inside describeIfDb, add:

it("sends a waitlist email when a waitlisted registration is published on the bus", async () => {
  const memberId = await seedMember(t);
  resetEventBus();
  // Bind getDb to the test schema for the subscriber path (see seam note),
  // then register subscribers against the fresh bus.
  registerNotificationSubscribers();

  await getEventBus().publish({
    type: "events.event.registered",
    eventId: "evt_1",
    memberId,
    waitlisted: true,
    at: new Date(),
  });

  expect(sent).toHaveLength(1);
  expect(sent[0]?.subject).toContain("Warteliste");

  unregisterNotificationSubscribers();
});
```

- [ ] **Step 3: Run, verify fail, implement the db seam, verify pass**

Run: `pnpm --filter @bdas/notifications exec vitest run src/index.test.ts`
Expected: FAIL first (no subscriber / wrong db), then PASS after wiring the `getDb` test seam and (if needed) stubbing `getEvent`. All 3 cases PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/notifications/src/subscribers.ts modules/notifications/src/index.test.ts
git commit -m "feat(notifications): subscribe to events bus → transactional sends"
```

---

### Task 8: Public surface (`index.ts`) + README

**Files:**

- Modify: `modules/notifications/src/index.ts`
- Create: `modules/notifications/README.md`

- [ ] **Step 1: Write the final `index.ts`** (rule 8 — only these symbols are importable)

```ts
/**
 * @bdas/notifications — public surface.
 *
 * Per CLAUDE.md §1 rule 8: only symbols re-exported here are visible to other
 * workspaces. Internal files (schema, templates, services) are private.
 */

export { sendTransactional } from "./services/send";
export { registerNotificationSubscribers } from "./subscribers";

export {
  consoleNotifier,
  getNotifier,
  setNotifier,
  type Notifier,
  type OutboundEmail,
} from "./notifier";
export { createResendNotifier, type ResendNotifierOptions } from "./notifier-resend";
export { getRecipientResolver, setRecipientResolver, type RecipientResolver } from "./resolver";

export type { TransactionalTemplate, TemplateData, SendResult, RecipientContact } from "./types";
```

> Do NOT export `schema.ts`, `templates.ts`, or `unregisterNotificationSubscribers` — they are private (the last is a test helper, imported directly by the co-located test, which is allowed).

- [ ] **Step 2: Write `README.md`** modeled on `modules/events/README.md`

```markdown
# `@bdas/notifications`

Outbound transactional email (spec §16, Phase 2 core slice). Subscribes to the
module event bus and sends the email that matches each event.

## Owned tables

| Table              | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `notification_log` | One audit row per send (`sent` / `failed`) |

Migration: `migrations/0001_init.sql`, runs after `members` (the FK target) per
the `infra/migrations` manifest.

## Public surface

\`\`\`ts
import {
sendTransactional,
registerNotificationSubscribers,
// composition seams (wired in apps/web at boot)
setNotifier, createResendNotifier, consoleNotifier, type Notifier,
setRecipientResolver, type RecipientResolver,
type TransactionalTemplate,
} from "@bdas/notifications";
\`\`\`

Anything not re-exported from `src/index.ts` is private (rule 8).

## How it works

`registerNotificationSubscribers()` (called once at boot) subscribes to three
`events`-module bus events and calls `sendTransactional`, which resolves the
recipient via the composed `RecipientResolver`, renders a German template,
sends through the composed `Notifier`, and writes a `notification_log` row.

| Bus event (`@bdas/events-module`)            | Template                         |
| -------------------------------------------- | -------------------------------- |
| `events.event.registered` (waitlisted=false) | `event_registration_confirmed`   |
| `events.event.registered` (waitlisted=true)  | `event_waitlisted`               |
| `events.event.deregistered`                  | `event_deregistration_confirmed` |
| `events.waitlist.promoted`                   | `event_waitlist_promoted`        |

## Cross-module boundaries (rule 1)

Email is owned by `auth`, identity by `members`. This module reads neither
table — it depends on the `RecipientResolver` interface, wired in `apps/web`
from `members.getMember` + `auth.getUserExport`. Transactional mail is
non-optional (§16), so there is no preference check.

## Testing

`src/index.test.ts` is a Postgres integration test (no DB mocks, per §4): it
applies auth + members + notifications migrations, fakes the Notifier and
Resolver, and asserts both direct `sendTransactional` calls and bus-driven
sends write the right `notification_log` row. `src/templates.test.ts` covers
render output.

## Deferred (future PRs)

`events.event.published` / `events.event.cancelled` fan-out (needs an `events`
registrant-list service — rule 1), `broadcastToGroup` / `broadcastFederal`,
per-user preferences, absorbing auth's verify/reset email (future ADR).
```

- [ ] **Step 3: Typecheck the whole module**

Run: `pnpm --filter @bdas/notifications typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add modules/notifications/src/index.ts modules/notifications/README.md
git commit -m "docs(notifications): public surface + module README"
```

---

### Task 9: Compose in `apps/web` (boot hook, gated by flag)

**Files:**

- Create: `apps/web/lib/notifications-bootstrap.ts`
- Modify: wherever `bootAuth()` is invoked (find the call sites of `apps/web/lib/auth-bootstrap.ts`) — add `bootNotifications()` beside it
- Verify (no edit expected): `infra/migrations/src/manifest.ts` contains `notifications`; `core/feature-flags` contains `notifications`

- [ ] **Step 1: Confirm manifest + flag already include `notifications`**

Run: `grep -n notifications infra/migrations/src/manifest.ts core/feature-flags/src/index.ts`
Expected: both files list `notifications`. (They do as of this plan — no edit.)

- [ ] **Step 2: Write `notifications-bootstrap.ts`** (mirror `auth-bootstrap.ts`; wire Notifier + Resolver, register subscribers, gate on the flag)

```ts
import { getUserExport } from "@bdas/auth";
import type { Db } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { getMember } from "@bdas/members";
import {
  consoleNotifier,
  createResendNotifier,
  registerNotificationSubscribers,
  setNotifier,
  setRecipientResolver,
  type RecipientContact,
} from "@bdas/notifications";

let booted = false;

/**
 * Idempotent bootstrap. Wires the notifications Notifier + RecipientResolver
 * and subscribes to the event bus — but only when the `notifications` flag is
 * on, so the module is inert in production until acceptance-complete (rule 6
 * applied to a non-route module).
 */
export function bootNotifications(): void {
  if (booted) return;
  booted = true;

  if (!isFlagOn("notifications")) return;

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  setNotifier(apiKey && from ? createResendNotifier({ apiKey, from }) : consoleNotifier);

  setRecipientResolver({
    async resolve(db: Db, memberId: string): Promise<RecipientContact | null> {
      const member = await getMember(db, memberId);
      if (!member) return null;
      const user = await getUserExport(db, member.userId);
      if (!user) return null;
      return { email: user.email, firstName: member.firstName };
    },
  });

  registerNotificationSubscribers();
}
```

> Confirm `Member` exposes `userId` (it does — `modules/members/src/schema.ts` and the `Member` type) and that `getUserExport` is re-exported from `@bdas/auth` (it is — `modules/auth/src/index.ts:28`). `getUserExport` returns the full GDPR-export shape; reusing it as a contact lookup is acceptable for this slice — note a follow-up to add a dedicated `auth.getUserContact` when auth email is reconciled.

- [ ] **Step 3: Call `bootNotifications()` beside `bootAuth()`**

Run: `grep -rn "bootAuth" apps/web --include="*.ts" --include="*.tsx"`
Then add `bootNotifications()` immediately after each `bootAuth()` call (same files), importing it from `@/lib/notifications-bootstrap`. Keep both idempotent boots together so every Server Action path wires both.

- [ ] **Step 4: Typecheck the app**

Run: `pnpm --filter @bdas/web typecheck` (use the actual web package name from `apps/web/package.json` if different)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/notifications-bootstrap.ts apps/web/
git commit -m "feat(web): compose notifications module at boot (flag-gated)"
```

---

### Task 10: Full verification + boundary lint

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the workspace**

Run: `pnpm -r typecheck`
Expected: PASS across all packages.

- [ ] **Step 2: Lint — confirm no cross-module deep imports**

Run: `pnpm -r lint` (or the repo's lint command from the root `package.json`)
Expected: PASS. Specifically no `@bdas/*/src/...` deep import and no import of `events`/`auth`/`members` internals from `notifications` (only their package roots).

- [ ] **Step 3: Run the notifications tests**

Run: `pnpm --filter @bdas/notifications test`
Expected: templates (4) PASS; integration (3) PASS with Postgres up, or SKIP without.

- [ ] **Step 4: Run the full test suite + migration dry-run** (the CI gates)

Run: `pnpm -r test` and the migration dry-run command used in CI (check `.github/workflows` for the exact `drizzle-kit migrate --dry-run` / aggregator invocation)
Expected: green; the aggregator applies `notifications/0001_init.sql` in manifest order without error.

- [ ] **Step 5: Self-review against the spec**

Confirm against §16: transactional sends for the four event cases ✓; `notification_log` audit ✓; broadcasts + preferences correctly deferred ✓; rule 1 (no foreign-table reads) ✓; rule 6 (flag-gated boot) ✓; rule 7 (migration in manifest) ✓; rule 8 (single `index.ts` surface) ✓.

- [ ] **Step 6: Final commit (if review produced fixes), then open PR**

```bash
git add -A
git commit -m "test(notifications): verification pass for core slice"
```

Open a PR titled `feat(notifications): events bus → transactional email (core slice)`. Per CLAUDE.md §4, run `/review` and — because this touches email/composition — `/security-review` before merge.

---

## Self-Review (plan author)

- **Spec coverage (§16):** transactional emails for event register/deregister/waitlist-promote → Tasks 4–7. `notification_log` audit → Tasks 2, 6. Broadcasts, federal/local, preferences → explicitly deferred (Scope). Verify-email/reset → out of scope by decision (auth keeps its Notifier).
- **Type consistency:** `TransactionalTemplate` values are identical in `types.ts` (Task 4), `templates.ts` `render` switch (Task 4), and the subscriber mapping (Task 7). `RecipientContact` defined once (Task 4), produced by the resolver (Tasks 5, 9), consumed in `send.ts` (Task 6). `OutboundEmail` defined in `notifier.ts` (Task 3), produced by `render` spread in `send.ts` (Task 6).
- **Cross-module boundaries:** `notifications` imports only package roots (`@bdas/events`, `@bdas/events-module`, `@bdas/db`, `@bdas/id`) and never `auth`/`members` — those are reached only via the composed resolver in `apps/web` (Task 9). No rule-1 table reads.
- **Known soft spots flagged for the implementer, not left as silent placeholders:** (a) `getDb()` test seam for the bus subscriber path (Task 7); (b) reusing `getUserExport` as a contact lookup (Task 9) with a noted follow-up; (c) exact `TestDb` cleanup idiom — re-read `modules/events/src/index.test.ts` (Task 6). Each names the file to check and the decision to make.
