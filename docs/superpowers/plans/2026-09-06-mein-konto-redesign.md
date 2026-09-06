# Mein Konto Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/account` from a settings form into a personal overview (identity, roles, upcoming events, group) and move account settings to `/account/einstellungen`.

**Architecture:** Two new read functions in the events module supply "what am I signed up for" and "how many events have I attended". A shared German role-label map moves into the members module. The web app then rebuilds `/account` as a two-column page — a fixed identity column beside a content column — and moves the e-mail, password and data-export cards to a new settings sub-page. No new tables, no migrations.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Components for reads), Drizzle ORM on PostgreSQL, Vitest (integration tests against Docker Postgres), Playwright for E2E, Tailwind + `@bdas/design-system`.

**Spec:** `docs/superpowers/specs/2026-09-06-mein-konto-redesign-design.md`

## Global Constraints

- **Package naming.** The events *module* is `@bdas/events-module`. `@bdas/events` is the core event **bus** in `core/events`. Importing the wrong one is the single easiest mistake in this plan.
- **Module boundaries (CLAUDE.md §1 rules 1 and 8).** A module owns its tables; nobody else reads them. Cross-module access goes through the module's `index.ts` only. Adding a function to `services/*.ts` without re-exporting it from `index.ts` leaves it invisible to the app.
- **No new tables and no migrations.** Every read in this plan runs against tables that already exist.
- **Design tokens (CLAUDE.md §7).** No inline hex, radius, shadow or duration. Use the Tailwind classes the preset generates from `core/design-system/src/tokens.ts` (`bg-bdas-surface`, `text-bdas-ink`, `text-bdas-ink-muted`, `border-bdas-soft`, `rounded-bdas`, `shadow-bdas-card`, `text-bdas-red`). If a value seems missing, stop and raise it — do not invent one.
- **Brand red is reserved** for active/open/accent state. On these pages that means exactly two things: the open-approvals alert, and the `event_organizer` role chip. Never a default text colour.
- **`<h1>Mein Konto</h1>` must survive on `/account`.** `e2e/auth.e2e.ts` asserts that heading by role in three places.
- **Tests ship in the same PR as the code** (CLAUDE.md §4). Never a follow-up.
- **Integration tests use real Postgres**, never a mocked DB (CLAUDE.md §3). Start it with `pnpm db:up`.
- **German UI copy, English code comments** — match the surrounding files.
- **One module per PR** (CLAUDE.md §4). Task grouping into PRs is in §"PR grouping" at the end.
- Run `pnpm lint` and `pnpm format` before each commit; CI enforces both.

---

### Task 1: `listMyUpcomingRegistrations` in the events module

**Files:**
- Create: `modules/events/src/services/mine.ts`
- Create: `modules/events/src/services/mine.test.ts`
- Modify: `modules/events/src/types.ts` (append the `MyRegistration` type)
- Modify: `modules/events/src/index.ts` (re-export)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type MyRegistration = { readonly eventId: string; readonly title: string; readonly startsAt: Date; readonly location: string | null; readonly groupId: string | null; readonly waitlistPosition: number | null }`
  - `listMyUpcomingRegistrations(db: Db, memberId: string, limit?: number): Promise<ReadonlyArray<MyRegistration>>` — default `limit` is 3.

Two things you must know before writing the test:

1. **`event_registrations.member_id` is `NOT NULL REFERENCES members(id)`** (`modules/events/migrations/0001_init.sql:32`), and `members.user_id` in turn references `auth_users`. An invented member id fails with a foreign-key violation. Seed real rows first, using the helper pattern already in this module at `modules/events/src/index.test.ts:112-123` — it is reproduced in the test below.
2. **`registerMember` refuses an event that has already started**, so a test needing a *past* registration must register for a future event and then move the event backwards with a direct `update`.

- [ ] **Step 1: Write the failing test**

Create `modules/events/src/services/mine.test.ts`. The header block (db-reachability probe, migration list) is copied from `list.test.ts` on purpose — that is the established pattern in this module, and each test file is self-contained.

```ts
/**
 * listMyUpcomingRegistrations against a real Postgres schema.
 * Skips when DATABASE_URL is unreachable (CI provides Postgres).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDb } from "@bdas/db/test";
import { resetEventBus } from "@bdas/events";

import { events } from "../schema";

import { listMyUpcomingRegistrations } from "./mine";
import { createEvent, publishEvent } from "./manage";
import { cancelRegistration, registerMember } from "./registration";

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

const describeIfDb = (await dbReachable()) ? describe : describe.skip;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const MEMBER = "mbr_lena";

describeIfDb("listMyUpcomingRegistrations", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_event_pages.sql"],
      ["..", "migrations", "0003_guest_registration.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();

    // event_registrations.member_id is NOT NULL REFERENCES members(id), and
    // members.user_id references auth_users — so every member id a test uses
    // has to exist for real. Same helper shape as index.test.ts:112-123.
    for (const id of [MEMBER, "mbr_someone_else", "mbr_first"]) {
      await t.client`
        INSERT INTO auth_users (id, email_normalized, email_display, status)
        VALUES (${"usr_" + id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, NULL, 'active')`;
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  async function publish(title: string, startsAt: Date, capacity?: number): Promise<string> {
    const ev = await createEvent(
      t.db,
      capacity === undefined
        ? { title, startsAt, visibility: "public" }
        : { title, startsAt, visibility: "public", capacity },
      "usr_creator",
    );
    await publishEvent(t.db, ev.id);
    return ev.id;
  }

  it("returns the member's upcoming registrations, soonest first", async () => {
    const later = await publish("Sommerfest", days(20));
    const sooner = await publish("Stammtisch", days(2));
    await registerMember(t.db, later, MEMBER);
    await registerMember(t.db, sooner, MEMBER);

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER);

    expect(rows.map((r) => r.eventId)).toEqual([sooner, later]);
    expect(rows[0]?.title).toBe("Stammtisch");
    expect(rows[0]?.waitlistPosition).toBeNull();
  });

  it("excludes another member's registrations", async () => {
    const id = await publish("Stammtisch", days(2));
    await registerMember(t.db, id, "mbr_someone_else");

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("excludes cancelled registrations", async () => {
    const id = await publish("Stammtisch", days(2));
    await registerMember(t.db, id, MEMBER);
    await cancelRegistration(t.db, id, MEMBER);

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("excludes events that have already started", async () => {
    // registerMember refuses a past event, so register first and move the event.
    const id = await publish("Rückblick", days(2));
    await registerMember(t.db, id, MEMBER);
    await t.db.update(events).set({ startsAt: days(-1) }).where(eq(events.id, id));

    expect(await listMyUpcomingRegistrations(t.db, MEMBER)).toEqual([]);
  });

  it("reports the waitlist rank for a waitlisted registration", async () => {
    const id = await publish("Workshop", days(5), 1);
    await registerMember(t.db, id, "mbr_first");
    await registerMember(t.db, id, MEMBER);

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER);
    expect(rows[0]?.waitlistPosition).toBe(1);
  });

  it("honours the limit", async () => {
    for (const n of [2, 4, 6, 8]) {
      const id = await publish(`Termin ${n}`, days(n));
      await registerMember(t.db, id, MEMBER);
    }

    const rows = await listMyUpcomingRegistrations(t.db, MEMBER, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.title)).toEqual(["Termin 2", "Termin 4"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm db:up
pnpm --filter @bdas/events-module test -- mine.test.ts
```

Expected: FAIL — `Failed to resolve import "./mine"`.

If instead every test **skips**, Postgres is not reachable. Fix that before continuing; a skipped suite proves nothing.

- [ ] **Step 3: Add the `MyRegistration` type**

Append to `modules/events/src/types.ts`:

```ts
/**
 * One upcoming event a member is signed up for, shaped for `/account`.
 * Deliberately not `EventItem`: the account overview needs six fields, and
 * returning the whole event would invite the page to render things the
 * personal overview has no business showing.
 */
export type MyRegistration = {
  readonly eventId: string;
  readonly title: string;
  readonly startsAt: Date;
  /** Display location: the structured name when set, else the free-text field. */
  readonly location: string | null;
  /** null = federation-wide. Lets the app tell "you organise this" from grants. */
  readonly groupId: string | null;
  /** null = confirmed; >=1 = waitlisted at that rank. */
  readonly waitlistPosition: number | null;
};
```

- [ ] **Step 4: Write the service**

Create `modules/events/src/services/mine.ts`:

```ts
/**
 * Read-side for "what has this member committed to".
 *
 * Separate from list.ts on purpose: that file answers "what may this viewer
 * see" and runs a visibility predicate. This one answers "what did this member
 * sign up for", where the registration itself is the authorisation — a member
 * holding a registration may always see that event on their own account page.
 */
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { eventRegistrations, events } from "../schema";
import type { MyRegistration } from "../types";

export type Db = PostgresJsDatabase<Record<string, never>>;

/** Default number of rows `/account` shows. */
const DEFAULT_LIMIT = 3;

/**
 * The member's next upcoming, non-cancelled registrations, soonest first.
 *
 * One joined query, not a list of events followed by a registration lookup per
 * event — the events module has been bitten by that fan-out before (see
 * `withCounts` in list.ts).
 *
 * Cancelled *events* drop out with the `published` predicate. That is
 * intentional: a cancelled event is not something to plan around, and the
 * member is told about the cancellation by e-mail.
 */
export async function listMyUpcomingRegistrations(
  db: Db,
  memberId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ReadonlyArray<MyRegistration>> {
  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
      location: events.location,
      locationName: events.locationName,
      groupId: events.groupId,
      waitlistPosition: eventRegistrations.waitlistPosition,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(
      and(
        eq(eventRegistrations.memberId, memberId),
        isNull(eventRegistrations.cancelledAt),
        eq(events.status, "published"),
        gte(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);

  return rows.map((r) => ({
    eventId: r.eventId,
    title: r.title,
    startsAt: r.startsAt,
    location: r.locationName ?? r.location,
    groupId: r.groupId,
    waitlistPosition: r.waitlistPosition,
  }));
}
```

- [ ] **Step 5: Run the test and verify it passes**

```bash
pnpm --filter @bdas/events-module test -- mine.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Re-export from the module's public surface**

In `modules/events/src/index.ts`, add after the `./services/registration` export block:

```ts
export { listMyUpcomingRegistrations } from "./services/mine";
```

and add `MyRegistration,` to the existing `export type { ... } from "./types";` block, keeping that list alphabetical:

```ts
export type {
  EventItem,
  EventRegistration,
  EventStatus,
  EventVisibility,
  MyRegistration,
  RegistrationResult,
  EventWithCounts,
  RosterRow,
  RosterStatus,
} from "./types";
```

- [ ] **Step 7: Typecheck, lint, commit**

```bash
pnpm --filter @bdas/events-module typecheck
pnpm lint
pnpm format
git add modules/events/src/services/mine.ts modules/events/src/services/mine.test.ts modules/events/src/types.ts modules/events/src/index.ts
git commit -m "feat(events): read a member's upcoming registrations"
```

---

### Task 2: `countAttendedEvents` in the events module

**Files:**
- Modify: `modules/events/src/services/mine.ts`
- Modify: `modules/events/src/services/mine.test.ts`
- Modify: `modules/events/src/index.ts`

**Interfaces:**
- Consumes: the `Db` type and test scaffolding from Task 1's `mine.ts` / `mine.test.ts`.
- Produces: `countAttendedEvents(db: Db, memberId: string): Promise<number>`

`event_attendance` has columns `id`, `eventId`, `memberId`, `attended` (boolean, default false), `checkedInAt`, `checkedInBy`. Rows exist for people who were checked in; `attended = false` means "row created, did not attend", so it must not be counted.

- [ ] **Step 1: Write the failing test**

Append to `modules/events/src/services/mine.test.ts`. Add `eventAttendance` to the schema import and `countAttendedEvents` to the `./mine` import, then add this block after the existing `describeIfDb`:

```ts
describeIfDb("countAttendedEvents", () => {
  let t: TestDb;

  beforeEach(async () => {
    t = await createTestDb();
    for (const file of [
      ["..", "..", "auth", "migrations", "0001_init.sql"],
      ["..", "..", "groups", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0001_init.sql"],
      ["..", "..", "members", "migrations", "0002_role_grants.sql"],
      ["..", "migrations", "0001_init.sql"],
      ["..", "migrations", "0002_event_pages.sql"],
      ["..", "migrations", "0003_guest_registration.sql"],
    ]) {
      const sql = await fs.readFile(path.join(__dirname, "..", ...file), "utf8");
      await t.client.unsafe(sql);
    }
    resetEventBus();

    // Both event_attendance.event_id and .member_id are NOT NULL foreign keys,
    // so attendance rows need a real event AND a real member behind them.
    for (const id of [MEMBER, "mbr_someone_else"]) {
      await t.client`
        INSERT INTO auth_users (id, email_normalized, email_display, status)
        VALUES (${"usr_" + id}, ${id + "@e2e.test"}, ${id + "@e2e.test"}, 'active')`;
      await t.client`
        INSERT INTO members (id, user_id, first_name, last_name, primary_group_id, status)
        VALUES (${id}, ${"usr_" + id}, 'Test', ${id}, NULL, 'active')`;
    }
  });

  afterEach(async () => {
    await t.cleanup();
  });

  /** Creates a real event, then an attendance row pointing at it. */
  async function attendance(rowId: string, memberId: string, attended: boolean): Promise<void> {
    const ev = await createEvent(
      t.db,
      { title: `Termin ${rowId}`, startsAt: days(-3), visibility: "public" },
      "usr_creator",
    );
    await t.db.insert(eventAttendance).values({
      id: rowId,
      eventId: ev.id,
      memberId,
      attended,
    });
  }

  it("counts only rows marked attended", async () => {
    await attendance("a1", MEMBER, true);
    await attendance("a2", MEMBER, true);
    await attendance("a3", MEMBER, false);

    expect(await countAttendedEvents(t.db, MEMBER)).toBe(2);
  });

  it("ignores other members", async () => {
    await attendance("b1", "mbr_someone_else", true);

    expect(await countAttendedEvents(t.db, MEMBER)).toBe(0);
  });

  it("returns zero when the member has no attendance rows", async () => {
    expect(await countAttendedEvents(t.db, MEMBER)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @bdas/events-module test -- mine.test.ts
```

Expected: FAIL — `countAttendedEvents is not exported by ./mine`.

- [ ] **Step 3: Write the implementation**

In `modules/events/src/services/mine.ts`, add `count` to the `drizzle-orm` import (`import { and, asc, count, eq, gte, isNull } from "drizzle-orm";`), add `eventAttendance` to the schema import, and append:

```ts
/**
 * How many events the member actually attended. `event_attendance` also holds
 * rows for people who were expected and did not show, so the `attended` flag —
 * not the row's existence — is the count.
 */
export async function countAttendedEvents(db: Db, memberId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(eventAttendance)
    .where(and(eq(eventAttendance.memberId, memberId), eq(eventAttendance.attended, true)));
  return Number(rows[0]?.n ?? 0);
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter @bdas/events-module test -- mine.test.ts
```

Expected: PASS, 9 tests total in the file.

- [ ] **Step 5: Re-export**

In `modules/events/src/index.ts`, extend the line added in Task 1:

```ts
export { countAttendedEvents, listMyUpcomingRegistrations } from "./services/mine";
```

- [ ] **Step 6: Typecheck, lint, commit**

```bash
pnpm --filter @bdas/events-module typecheck
pnpm lint
pnpm format
git add modules/events/src/services/mine.ts modules/events/src/services/mine.test.ts modules/events/src/index.ts
git commit -m "feat(events): count a member's attended events"
```

---

### Task 3: Shared German role labels in the members module

**Files:**
- Modify: `modules/members/src/types.ts`
- Create: `modules/members/src/role-labels.test.ts`
- Modify: `modules/members/src/index.ts`
- Modify: `apps/web/app/(board)/_components/AuditLog.tsx`
- Modify: `apps/web/app/(board)/_components/RoleRoster.tsx`

**Interfaces:**
- Consumes: `Role` from `@bdas/auth` (the seven roles are `member`, `local_board`, `local_board_lead`, `federal_board`, `alumnus`, `event_organizer`, `page_editor`).
- Produces: `ROLE_LABELS: Record<Role, string>`, exported from `@bdas/members`.

Why this task exists: the same map is currently a private const in **two** app components, and they have already drifted — `AuditLog.tsx` knows three roles, `RoleRoster.tsx` knows five. Task 6 would make a third copy. The label belongs to the module that owns `member_role_grants`, following the `REJECTION_CATEGORY_LABELS` precedent already in `modules/members/src/types.ts`.

Typing the map as `Record<Role, string>` is the point: adding a role to `@bdas/auth` then fails the build here until it gets a German name, instead of silently rendering a raw key like `page_editor` to a member.

- [ ] **Step 1: Write the failing test**

Create `modules/members/src/role-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isRole } from "./roles";
import { ROLE_LABELS } from "./types";

describe("ROLE_LABELS", () => {
  it("labels every role the auth module defines", () => {
    for (const key of Object.keys(ROLE_LABELS)) {
      expect(isRole(key), `${key} is not a Role`).toBe(true);
    }
    expect(Object.keys(ROLE_LABELS)).toHaveLength(7);
  });

  it("gives every role a non-empty German label", () => {
    for (const [role, label] of Object.entries(ROLE_LABELS)) {
      expect(label.trim(), `${role} has an empty label`).not.toBe("");
      expect(label, `${role} still reads like a key`).not.toMatch(/_/);
    }
  });

  it("keeps the labels the board views already show", () => {
    expect(ROLE_LABELS.federal_board).toBe("Bundesvorstand");
    expect(ROLE_LABELS.local_board_lead).toBe("Lead");
    expect(ROLE_LABELS.local_board).toBe("Vorstand");
    expect(ROLE_LABELS.event_organizer).toBe("Organisator");
    expect(ROLE_LABELS.page_editor).toBe("Seiten-Editor");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @bdas/members test -- role-labels.test.ts
```

Expected: FAIL — `ROLE_LABELS is not exported by ./types`.

- [ ] **Step 3: Add the map**

In `modules/members/src/types.ts`, add the `Role` import at the top (`import type { Role } from "@bdas/auth";`) and append:

```ts
/**
 * German names for the roles. They live here, in the module that owns
 * `member_role_grants`, because the board's roster, the audit log and the
 * member's own account page all render them — and none of those may import
 * another's internals. Same reasoning as REJECTION_CATEGORY_LABELS above.
 *
 * Typed as a total Record: a new role in @bdas/auth fails this build until it
 * has a German name, rather than leaking a raw key into the UI.
 */
export const ROLE_LABELS: Record<Role, string> = {
  member: "Mitglied",
  alumnus: "Alumnus",
  local_board: "Vorstand",
  local_board_lead: "Lead",
  federal_board: "Bundesvorstand",
  event_organizer: "Organisator",
  page_editor: "Seiten-Editor",
};
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter @bdas/members test -- role-labels.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Re-export from the module surface**

In `modules/members/src/index.ts`, add `ROLE_LABELS` to the existing value export beside `REJECTION_CATEGORY_LABELS`:

```ts
export { REJECTION_CATEGORY_LABELS, ROLE_LABELS } from "./types";
```

- [ ] **Step 6: Delete both private copies**

In `apps/web/app/(board)/_components/AuditLog.tsx`, delete the local const and import the shared one:

```tsx
import { ROLE_LABELS, type GrantAuditEntry } from "@bdas/members";
```

Then change the render site from `{ROLE_LABEL[e.role] ?? e.role}` to:

```tsx
{ROLE_LABELS[e.role]}
```

In `apps/web/app/(board)/_components/RoleRoster.tsx`, delete its local const and import:

```tsx
import { ROLE_LABELS, type RoleHolder } from "@bdas/members";
```

Then change `{ROLE_LABEL[h.role]}` to:

```tsx
{ROLE_LABELS[h.role]}
```

If either file's `role` property is typed as `string` rather than `Role`, the indexed access will not typecheck. Do **not** widen `ROLE_LABELS` to `Record<string, string>` to make that go away — that throws away the exhaustiveness this task exists to buy. Narrow at the call site instead: `ROLE_LABELS[e.role as Role]`, importing `Role` from `@bdas/auth`.

- [ ] **Step 7: Verify nothing regressed, then commit**

```bash
pnpm --filter @bdas/members test
pnpm --filter @bdas/members typecheck
pnpm --filter @bdas/web typecheck
pnpm lint
pnpm format
git add modules/members/src/types.ts modules/members/src/role-labels.test.ts modules/members/src/index.ts "apps/web/app/(board)/_components/AuditLog.tsx" "apps/web/app/(board)/_components/RoleRoster.tsx"
git commit -m "refactor(members): own the German role labels"
```

---

### Task 4: The account view model

**Files:**
- Create: `apps/web/app/account/view-model.ts`
- Create: `apps/web/app/account/view-model.test.ts`

**Interfaces:**
- Consumes: `MemberStatus` from `@bdas/members`, `Grant` from `@bdas/members`, `MyRegistration` from `@bdas/events-module` (Task 1).
- Produces:
  - `type AccountLayoutMode = "full" | "plain"`
  - `type IdentityRow = { label: string; value: string }`
  - `buildIdentityRows(input: IdentityInput): IdentityRow[]`
  - `layoutMode(status: MemberStatus | null): AccountLayoutMode`
  - `roleChips(grants: ReadonlyArray<Grant>): RoleChip[]` where `type RoleChip = { label: string; accent: boolean }`

This task is pure logic with no database and no JSX, so it is fast to test and it is where the state rules from spec §5 actually live. The page in Task 6 becomes a thin renderer over it.

Rules being encoded:
- `layoutMode` returns `"full"` only for an `active` member. Every other status, and a user with no member row at all, gets `"plain"` — a single column at every width (spec §5).
- `buildIdentityRows` omits `Mitglied seit` when `joinedAt` is null, and omits `Gruppe` when there is no group name. It never emits a row with an empty value.
- `roleChips` drops the implicit `member` and `alumnus` grants — a member does not need a chip telling them they are a member — deduplicates by label, and marks `event_organizer` as the accent chip.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/account/view-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildIdentityRows, layoutMode, roleChips } from "./view-model";

describe("layoutMode", () => {
  it("gives an active member the full two-column page", () => {
    expect(layoutMode("active")).toBe("full");
  });

  it("gives every other status the plain single column", () => {
    expect(layoutMode("pending")).toBe("plain");
    expect(layoutMode("inactive")).toBe("plain");
    expect(layoutMode("alumnus")).toBe("plain");
  });

  it("gives a user without a member row the plain single column", () => {
    expect(layoutMode(null)).toBe("plain");
  });
});

describe("buildIdentityRows", () => {
  it("renders status, group and joined date", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Berlin",
      joinedAt: new Date("2025-03-14T00:00:00Z"),
    });

    expect(rows).toEqual([
      { label: "Status", value: "Aktives Mitglied" },
      { label: "Gruppe", value: "BDAS Berlin" },
      { label: "Mitglied seit", value: "14. März 2025" },
    ]);
  });

  it("omits the joined date when it is unknown", () => {
    const rows = buildIdentityRows({
      status: "active",
      groupName: "BDAS Berlin",
      joinedAt: null,
    });

    expect(rows.map((r) => r.label)).toEqual(["Status", "Gruppe"]);
  });

  it("omits the group when the member has none", () => {
    const rows = buildIdentityRows({ status: "active", groupName: null, joinedAt: null });

    expect(rows.map((r) => r.label)).toEqual(["Status"]);
  });
});

describe("roleChips", () => {
  it("drops the implicit member grant", () => {
    expect(roleChips([{ role: "member", groupId: null }])).toEqual([]);
  });

  it("accents the organizer role and nothing else", () => {
    const chips = roleChips([
      { role: "member", groupId: null },
      { role: "event_organizer", groupId: "grp_berlin" },
      { role: "local_board", groupId: "grp_berlin" },
    ]);

    expect(chips).toEqual([
      { label: "Organisator", accent: true },
      { label: "Vorstand", accent: false },
    ]);
  });

  it("deduplicates a role held in two groups", () => {
    const chips = roleChips([
      { role: "event_organizer", groupId: "grp_berlin" },
      { role: "event_organizer", groupId: "grp_potsdam" },
    ]);

    expect(chips).toEqual([{ label: "Organisator", accent: true }]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @bdas/web test -- view-model.test.ts
```

Expected: FAIL — cannot resolve `./view-model`.

- [ ] **Step 3: Write the view model**

Create `apps/web/app/account/view-model.ts`:

```ts
import type { Grant, MemberStatus } from "@bdas/members";
import { ROLE_LABELS } from "@bdas/members";

/**
 * "full" = the designed two-column overview. "plain" = a single column at every
 * width: status line, then the profile record.
 *
 * Only an active member gets the full page (design spec §5). Every new sign-up
 * passes through "plain" on the way to active, so it is a live path, not a
 * dead branch — it has to be correct, it does not have to be designed.
 */
export type AccountLayoutMode = "full" | "plain";

export type IdentityRow = { label: string; value: string };
export type RoleChip = { label: string; accent: boolean };

export type IdentityInput = {
  status: MemberStatus | null;
  groupName: string | null;
  joinedAt: Date | null;
};

const STATUS_TEXT: Record<MemberStatus, string> = {
  pending: "Bewerbung eingereicht",
  active: "Aktives Mitglied",
  inactive: "Inaktiv",
  alumnus: "Alumnus",
};

/** Roles a member always has by virtue of their status. A chip saying
 *  "Mitglied" tells them nothing they did not already know. */
const IMPLICIT_ROLES = new Set(["member", "alumnus"]);

export function layoutMode(status: MemberStatus | null): AccountLayoutMode {
  return status === "active" ? "full" : "plain";
}

export function buildIdentityRows(input: IdentityInput): IdentityRow[] {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Status", value: input.status ? STATUS_TEXT[input.status] : null },
    { label: "Gruppe", value: input.groupName },
    {
      label: "Mitglied seit",
      value: input.joinedAt
        ? input.joinedAt.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null,
    },
  ];

  return rows.flatMap((r) => {
    const value = r.value?.trim() ?? "";
    return value === "" ? [] : [{ label: r.label, value }];
  });
}

/**
 * The member's granted authorities, as chips. Scope is deliberately dropped:
 * a member holding a role in two groups sees one chip, because the chip answers
 * "what may I do", not "where". Brand red marks the organizer role — an open,
 * active capability (CLAUDE.md §7).
 */
export function roleChips(grants: ReadonlyArray<Grant>): RoleChip[] {
  const seen = new Set<string>();
  const chips: RoleChip[] = [];

  for (const g of grants) {
    if (IMPLICIT_ROLES.has(g.role)) continue;
    const label = ROLE_LABELS[g.role];
    if (seen.has(label)) continue;
    seen.add(label);
    chips.push({ label, accent: g.role === "event_organizer" });
  }

  return chips;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter @bdas/web test -- view-model.test.ts
```

Expected: PASS, 10 tests.

If `Mitglied seit` fails on the exact string, print the actual value — Node's ICU may render `14. März 2025` differently in your environment. Match the assertion to what `toLocaleDateString("de-DE", …)` actually produces; do not hand-roll a formatter to satisfy the test.

- [ ] **Step 5: Commit**

```bash
pnpm lint
pnpm format
git add apps/web/app/account/view-model.ts apps/web/app/account/view-model.test.ts
git commit -m "feat(account): view model for the overview page"
```

---

### Task 5: The settings sub-page

**Files:**
- Create: `apps/web/app/account/einstellungen/page.tsx`
- Modify: `apps/web/app/account/page.tsx` (remove the two cards and the export button; add a link)

**Interfaces:**
- Consumes: existing `EmailChangeCard`, `ChangePasswordCard`, `PASSWORD_RULE_HINT` from `@bdas/auth`.
- Produces: the route `/account/einstellungen`.

`apps/web/app/account/layout.tsx` already sets `export const dynamic = "force-dynamic"` and applies to children, so the new page inherits request-time rendering and needs no such declaration of its own.

Section order is fixed by spec §3.2 and does not change when notification preferences ship: E-Mail-Adresse → Passwort → E-Mail-Benachrichtigungen (reserved, disabled) → Deine Daten.

- [ ] **Step 1: Create the settings page**

Create `apps/web/app/account/einstellungen/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { PASSWORD_RULE_HINT } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { Button, Card } from "@bdas/design-system";
import { getCurrentMember } from "@bdas/members";

import { requireAuthFlag } from "../../_auth/flag";
import { requireMembersFlag } from "../../_members/flag";
import { readSessionCookie } from "../../../lib/auth-cookie";
import { ChangePasswordCard } from "../ChangePasswordCard";
import { EmailChangeCard } from "../EmailChangeCard";

export const metadata = { title: "Kontoeinstellungen" };

export default async function AccountSettingsPage() {
  requireAuthFlag();
  requireMembersFlag();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) redirect("/anmelden");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/account" className="text-sm text-bdas-ink-muted hover:underline">
          ← Mein Konto
        </Link>
        <h1 className="text-2xl font-semibold text-bdas-ink">Kontoeinstellungen</h1>
        <p className="text-bdas-ink-body">
          Zugangsdaten und deine Daten. Dein Profil bearbeitest du auf der Übersicht.
        </p>
      </div>

      <EmailChangeCard currentEmail={me.user.email} />

      <ChangePasswordCard passwordHint={PASSWORD_RULE_HINT} />

      {/* Reserved. Position and name are fixed now so that shipping the
          preferences is an insert, not a rearrangement. Not a control: it is
          inert and announces itself as unavailable. */}
      <Card flat className="border-dashed p-6" aria-disabled="true">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-bdas-ink-muted">E-Mail-Benachrichtigungen</h2>
          <span className="rounded-bdas-pill border border-bdas-strong px-2.5 py-0.5 text-xs uppercase tracking-wide text-bdas-ink-muted">
            Kommt bald
          </span>
        </div>
        <p className="mt-2 text-sm text-bdas-ink-muted">
          Hier wählst du künftig, welche Benachrichtigungen du per E-Mail bekommst.
        </p>
      </Card>

      <Card flat className="p-6">
        <h2 className="mb-2 text-lg font-semibold text-bdas-ink">Deine Daten</h2>
        <p className="mb-4 text-sm text-bdas-ink-body">
          Export aller zu dir gespeicherten Daten als JSON — Art. 20 DSGVO.
        </p>
        <Link href="/account/datenexport">
          <Button variant="secondary">Meine Daten exportieren</Button>
        </Link>
      </Card>
    </main>
  );
}
```

Check the class names against `core/design-system/src/tailwind-preset.ts` before running. `rounded-bdas-pill`, `border-bdas-strong` and `text-bdas-ink-muted` must exist there. If one does not, use the name the preset actually generates for `radii.pill`, `border.strong` and `ink.muted` — do not add a token and do not inline a value.

- [ ] **Step 2: Verify it renders**

```bash
pnpm --filter @bdas/web dev
```

Sign in, open `http://localhost:3000/account/einstellungen`. Expected: four sections in the order above; the third is visibly muted, dashed and does nothing on click. Changing the e-mail and the password still work.

- [ ] **Step 3: Remove the moved pieces from `/account`**

In `apps/web/app/account/page.tsx`, delete these three blocks:

```tsx
      <EmailChangeCard currentEmail={me.user.email} />

      <ChangePasswordCard passwordHint={PASSWORD_RULE_HINT} />
```

and

```tsx
        <Link href="/account/datenexport">
          <Button variant="secondary">Meine Daten exportieren</Button>
        </Link>
```

Replace the button row at the bottom with:

```tsx
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/einstellungen">
          <Button variant="secondary">Kontoeinstellungen</Button>
        </Link>
        <form action="/abmelden" method="post">
          <Button type="submit" variant="secondary">
            Abmelden
          </Button>
        </form>
      </div>
```

Then delete the now-unused imports: `PASSWORD_RULE_HINT`, `ChangePasswordCard`, `EmailChangeCard`. Leave `Button` and `Link` — both are still used.

- [ ] **Step 4: Typecheck and commit**

`pnpm lint` fails on unused imports, which is the check that catches a missed one.

```bash
pnpm --filter @bdas/web typecheck
pnpm lint
pnpm format
git add apps/web/app/account/einstellungen/page.tsx apps/web/app/account/page.tsx
git commit -m "feat(account): move account settings to their own page"
```

---

### Task 6: The two-column overview

**Files:**
- Create: `apps/web/app/account/IdentityColumn.tsx`
- Modify: `apps/web/app/account/page.tsx`

**Interfaces:**
- Consumes: `buildIdentityRows`, `roleChips`, `layoutMode` (Task 4); `AccountAvatar` (existing).
- Produces: `<IdentityColumn photoUrl initials name email rows chips />`

The page keeps every existing behaviour: `requireAuthFlag`, `requireMembersFlag`, the redirect to `/anmelden`, the group-change alert, `ApprovalsAlert`, and `EditableProfile` with its `complete` gate. This task changes the arrangement, not the logic.

- [ ] **Step 1: Write the identity column**

Create `apps/web/app/account/IdentityColumn.tsx`:

```tsx
import Link from "next/link";

import { Card } from "@bdas/design-system";

import { AccountAvatar } from "./AccountAvatar";
import type { IdentityRow, RoleChip } from "./view-model";

export type IdentityColumnProps = {
  photoUrl: string | null;
  initials: string;
  name: string;
  email: string;
  rows: ReadonlyArray<IdentityRow>;
  chips: ReadonlyArray<RoleChip>;
};

/**
 * Who the member is in this federation and what they may do. Fixed beside the
 * content column so the answer stays on screen while the rest scrolls — it is
 * the question the old page never answered at all.
 */
export function IdentityColumn({
  photoUrl,
  initials,
  name,
  email,
  rows,
  chips,
}: IdentityColumnProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <div className="flex flex-col items-start gap-4">
          <AccountAvatar photoUrl={photoUrl} initials={initials} />
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-bdas-ink">{name}</h2>
            <p className="text-sm text-bdas-ink-muted">{email}</p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-[minmax(0,6rem)_1fr] gap-x-4 gap-y-2 border-t border-bdas-soft pt-5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-bdas-ink-muted">{row.label}</dt>
              <dd className="text-bdas-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        {chips.length > 0 ? (
          <div className="mt-5 border-t border-bdas-soft pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-bdas-ink-muted">
              Deine Rollen
            </h3>
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li
                  key={chip.label}
                  className={
                    chip.accent
                      ? "rounded-bdas-pill border border-bdas-soft bg-bdas-overlay-faint px-3 py-1 text-sm text-bdas-red"
                      : "rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-ink-body"
                  }
                >
                  {chip.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-bdas-ink-muted">
              Rollen vergibt der Vorstand deiner Gruppe.
            </p>
          </div>
        ) : null}
      </Card>

      <Card flat className="p-4">
        <div className="flex flex-col items-start gap-1 text-sm">
          <Link href="/account/einstellungen" className="text-bdas-ink-body hover:underline">
            Kontoeinstellungen →
          </Link>
          <form action="/abmelden" method="post">
            <button type="submit" className="text-bdas-ink-body hover:underline">
              Abmelden
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Restructure the page**

In `apps/web/app/account/page.tsx`:

Add the imports:

```tsx
import { IdentityColumn } from "./IdentityColumn";
import { buildIdentityRows, layoutMode, roleChips } from "./view-model";
```

After the existing `complete` computation, add:

```tsx
  const mode = layoutMode(me.member?.status ?? null);
  const identityRows = buildIdentityRows({
    status: me.member?.status ?? null,
    groupName: currentGroupName,
    joinedAt: me.member?.joinedAt ?? null,
  });
  const chips = roleChips(me.grants);
  const fullName = me.member ? `${me.member.firstName} ${me.member.lastName}`.trim() : me.user.email;
```

Replace the `<main>` element and everything inside it with:

```tsx
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Mein Konto</h1>

      {mode === "plain" ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {statusAlerts}
          {profileCard}
          {settingsLink}
        </div>
      ) : (
        <div className="grid gap-7 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:items-start">
          <IdentityColumn
            photoUrl={photoUrl}
            initials={initials}
            name={fullName}
            email={me.user.email}
            rows={identityRows}
            chips={chips}
          />
          <div className="flex flex-col gap-6">
            {statusAlerts}
            {profileCard}
          </div>
        </div>
      )}
    </main>
```

Then, above the `return`, define the three shared fragments so both branches render the same components:

```tsx
  const statusAlerts = (
    <>
      {justSubmitted && status === "pending" ? (
        <Alert variant="success" title="Bewerbung abgeschickt">
          Deine Bewerbung ist eingegangen und liegt jetzt beim lokalen Vorstand zur Entscheidung.
        </Alert>
      ) : status === "pending" ? (
        <Alert variant="info" title="Profil eingereicht">
          {STATUS_LABEL["pending"]}
        </Alert>
      ) : null}

      {openChange && targetGroupName ? (
        <Alert variant="info" title="Gruppenwechsel beantragt">
          <span className="flex flex-col gap-2">
            <span>
              Du bist Mitglied bei <strong>{currentGroupName ?? "keiner Gruppe"}</strong> und hast
              den Wechsel zu <strong>{targetGroupName}</strong> beantragt (seit{" "}
              {new Date(openChange.requestedAt).toLocaleDateString("de-DE")}). Bis der Vorstand von{" "}
              {targetGroupName} entscheidet, bleibst du Mitglied bei{" "}
              {currentGroupName ?? "keiner Gruppe"}.
            </span>
            <WithdrawChangeButton />
          </span>
        </Alert>
      ) : null}

      <ApprovalsAlert groupSlug={currentGroupSlug} />
    </>
  );

  const profileCard = (
    <Card flat className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-bdas-ink">
        {complete ? "Meine Daten" : me.member ? "Profil bearbeiten" : "Profil vervollständigen"}
      </h2>
      <EditableProfile
        complete={complete}
        rows={buildProfileSummary({
          firstName: me.member?.firstName ?? "",
          lastName: me.member?.lastName ?? "",
          groupName: currentGroupName,
          studiengang: profile?.studiengang ?? "",
          abschlussart: profile?.abschlussart ?? "",
          uni: profile?.uni ?? "",
          geburtsdatum: profile?.geburtsdatum ?? "",
          gefundenDurch: profile?.gefundenDurch ?? "",
          empfehlerName: profile?.empfehlerName ?? null,
          vorstellung: profile?.vorstellung ?? null,
        })}
        profileForm={{ ...membersFormProps, isNew: !me.member }}
        extendedForm={profileFlagOn && me.member ? { initial: extendedInitial } : null}
      />
    </Card>
  );

  const settingsLink = (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/account/einstellungen">
        <Button variant="secondary">Kontoeinstellungen</Button>
      </Link>
      <form action="/abmelden" method="post">
        <Button type="submit" variant="secondary">
          Abmelden
        </Button>
      </form>
    </div>
  );
```

The `"Mitgliedschaft aktiv"` success alert is deliberately gone: it is a durable state, not an event, and it now reads as the `Status` row in the identity column (spec §1 fault 2). The `AccountAvatar` no longer renders in the page header — it lives in `IdentityColumn`.

- [ ] **Step 3: Check every state by hand**

```bash
pnpm --filter @bdas/web dev
```

Verify, signed in as an **active** member: two columns on a wide window; one column below the `md` breakpoint with the identity card first. Verify as a **pending** member (or temporarily hard-code `mode = "plain"`): single column, no identity card, profile record present, no crash. Confirm the `h1` still reads "Mein Konto" in both.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm --filter @bdas/web typecheck
pnpm --filter @bdas/web test
pnpm lint
pnpm format
git add apps/web/app/account/IdentityColumn.tsx apps/web/app/account/page.tsx
git commit -m "feat(account): two-column overview with identity and roles"
```

---

### Task 7: Events, attendance and group blocks

**Files:**
- Create: `apps/web/app/account/UpcomingEvents.tsx`
- Modify: `apps/web/app/account/page.tsx`

**Interfaces:**
- Consumes: `listMyUpcomingRegistrations`, `countAttendedEvents` (Tasks 1–2); `roleChips` is not used here.
- Produces: `<UpcomingEvents registrations organizerGroupIds />`

The calendar export already exists as a route handler at `apps/web/app/events/[id]/ics`, so the link is `/events/<id>/ics`. Do not create a second route.

- [ ] **Step 1: Write the events block**

Create `apps/web/app/account/UpcomingEvents.tsx`:

```tsx
import Link from "next/link";

import { Card } from "@bdas/design-system";
import type { MyRegistration } from "@bdas/events-module";

export type UpcomingEventsProps = {
  registrations: ReadonlyArray<MyRegistration>;
  /** Groups the member organises for — drives the "du organisierst" chip. */
  organizerGroupIds: ReadonlyArray<string>;
};

const DAY = new Intl.DateTimeFormat("de-DE", { day: "2-digit" });
const MONTH = new Intl.DateTimeFormat("de-DE", { month: "short" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * What the member has committed to. Rendered only when there is something —
 * an empty "no events" card on a personal overview is noise, not information.
 */
export function UpcomingEvents({ registrations, organizerGroupIds }: UpcomingEventsProps) {
  if (registrations.length === 0) return null;

  return (
    <Card className="p-6">
      <div className="mb-2 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-bdas-ink">Deine nächsten Veranstaltungen</h2>
        <Link href="/events" className="text-sm text-bdas-ink-body hover:underline">
          Alle →
        </Link>
      </div>

      <ul className="flex flex-col">
        {registrations.map((r) => {
          const organises = r.groupId !== null && organizerGroupIds.includes(r.groupId);
          return (
            <li
              key={r.eventId}
              className="flex items-center gap-4 border-b border-bdas-soft py-3 last:border-b-0 last:pb-0"
            >
              <div className="w-14 shrink-0 rounded-bdas-sm border border-bdas-soft py-1.5 text-center leading-tight">
                <span className="block text-lg font-semibold text-bdas-ink">
                  {DAY.format(r.startsAt)}
                </span>
                <span className="block text-xs uppercase tracking-wide text-bdas-ink-muted">
                  {MONTH.format(r.startsAt)}
                </span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/events/${r.eventId}`} className="font-semibold text-bdas-ink hover:underline">
                  {r.title}
                </Link>
                <span className="text-sm text-bdas-ink-muted">
                  {TIME.format(r.startsAt)} Uhr
                  {r.location ? ` · ${r.location}` : ""}
                  {r.waitlistPosition === null
                    ? ""
                    : ` · Warteliste, Platz ${r.waitlistPosition}`}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {organises ? (
                  <span className="rounded-bdas-pill border border-bdas-soft px-3 py-1 text-sm text-bdas-red">
                    du organisierst
                  </span>
                ) : null}
                <a
                  href={`/events/${r.eventId}/ics`}
                  className="rounded-bdas-sm border border-bdas-strong px-3 py-1 text-sm text-bdas-ink hover:bg-bdas-surface-hover"
                >
                  .ics
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 2: Wire the reads into the page**

In `apps/web/app/account/page.tsx`, add the imports:

```tsx
import { countAttendedEvents, listMyUpcomingRegistrations } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";

import { UpcomingEvents } from "./UpcomingEvents";
```

(`isFlagOn` is already imported — do not add it twice.)

After the `chips` computation from Task 6, add:

```tsx
  // Events is flag-gated (CLAUDE.md §3): with the flag off the module's tables
  // may not even be migrated, so guard the reads rather than the render.
  const eventsOn = isFlagOn("events");
  const memberId = me.member?.id ?? null;
  const [registrations, attended] =
    eventsOn && memberId && mode === "full"
      ? await Promise.all([
          listMyUpcomingRegistrations(db, memberId),
          countAttendedEvents(db, memberId),
        ])
      : [[], 0];

  const organizerGroupIds = me.grants
    .filter((g) => g.role === "event_organizer" && g.groupId !== null)
    .map((g) => g.groupId as string);
```

Then in the `mode === "full"` branch, insert these blocks into the content column **above** `{profileCard}`:

```tsx
            <UpcomingEvents
              registrations={registrations}
              organizerGroupIds={organizerGroupIds}
            />

            {attended > 0 || currentGroupSlug ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {attended > 0 ? (
                  <Card className="p-6">
                    <span className="block text-3xl font-semibold tabular-nums text-bdas-ink">
                      {attended}
                    </span>
                    <span className="block text-sm text-bdas-ink-muted">
                      {attended === 1 ? "Veranstaltung besucht" : "Veranstaltungen besucht"}
                    </span>
                  </Card>
                ) : null}

                {currentGroupSlug && currentGroupName ? (
                  <Link href={`/gruppen/${currentGroupSlug}`} className="block">
                    <Card className="h-full p-6">
                      <span className="block font-semibold text-bdas-ink">{currentGroupName}</span>
                      <span className="mt-2 block text-sm text-bdas-ink-body underline">
                        Zur Gruppenseite
                      </span>
                    </Card>
                  </Link>
                ) : null}
              </div>
            ) : null}
```

Confirm the group route is `/gruppen/<slug>` with:

```bash
ls apps/web/app/gruppen
```

- [ ] **Step 3: Verify against real data**

```bash
pnpm db:up
pnpm --filter @bdas/web dev
```

Sign in as an active member with at least one upcoming registration. Expected: the event appears with day, month, time and place; the `.ics` link downloads a calendar file; a member on a waitlist sees "Warteliste, Platz 1"; a member with no registrations sees no events card at all rather than an empty one.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
pnpm --filter @bdas/web typecheck
pnpm --filter @bdas/web test
pnpm lint
pnpm format
git add apps/web/app/account/UpcomingEvents.tsx apps/web/app/account/page.tsx
git commit -m "feat(account): show upcoming registrations, attendance and group"
```

---

### Task 8: End-to-end coverage

**Files:**
- Modify: `e2e/auth.e2e.ts`
- Modify: `e2e/profile-onboarding.e2e.ts`

**Interfaces:**
- Consumes: everything from Tasks 5–7.
- Produces: no code others depend on.

The two existing specs are the regression net for this change: `auth.e2e.ts` asserts the `Mein Konto` heading after login, after reload and after a password reset; `profile-onboarding.e2e.ts` edits the extended profile on this page. Both must keep passing untouched in substance — if either needs its selectors rewritten, the page has broken a contract, and the fix belongs in the page.

- [ ] **Step 1: Run the existing suites unchanged**

```bash
pnpm db:up
pnpm e2e -- auth.e2e.ts profile-onboarding.e2e.ts
```

Expected: PASS. If the `Mein Konto` heading assertion fails, Task 6 dropped the `h1` — fix the page, not the test.

- [ ] **Step 2: Add a settings-page case**

Append to `e2e/auth.e2e.ts`, inside the same file's test list:

```ts
test("a member reaches account settings from Mein Konto", async ({ page }) => {
  const email = uniqueEmail("settings");
  await registerVerifyLogin(page, { email });

  await page.goto("/account");
  await page.getByRole("link", { name: "Kontoeinstellungen" }).click();

  await expect(page).toHaveURL(/\/account\/einstellungen/);
  await expect(page.getByRole("heading", { name: "Kontoeinstellungen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E-Mail-Adresse" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Passwort" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Daten" })).toBeVisible();

  await page.getByRole("link", { name: "← Mein Konto" }).click();
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});
```

Add `registerVerifyLogin` to the existing `./helpers/flows` import at the top of the file; `uniqueEmail` is already imported from `./helpers/db`. Do not write a new helper — `registerVerifyLogin(page, { email })` at `e2e/helpers/flows.ts:111` already does register + verify + login.

The heading strings above are the real ones: `EmailChangeCard.tsx:36` renders `E-Mail-Adresse` and `ChangePasswordCard.tsx:43` renders `Passwort` — not "… ändern". `getByRole("heading", { name: "Passwort" })` matches on accessible name, so if it also matches the "E-Mail-Adresse" card's contents, tighten it with `{ name: "Passwort", exact: true }`.

- [ ] **Step 3: Run it**

```bash
pnpm e2e -- auth.e2e.ts
```

Expected: PASS, including the new case.

- [ ] **Step 4: Commit**

```bash
pnpm lint
pnpm format
git add e2e/auth.e2e.ts e2e/profile-onboarding.e2e.ts
git commit -m "test(e2e): cover the account settings sub-page"
```

---

### Task 9: Record the decision as an ADR

**Files:**
- Create: `docs/decisions/0034-account-overview-and-settings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing other code depends on.

CLAUDE.md §4: decisions go in `docs/decisions/`, not in chat or commit messages. The highest number in the directory today is `0033-blog-comments.md`, so this is `0034`. (Note `0026` and `0028` each appear twice already — check the directory listing before assuming, and take the next free number if `0034` is taken by the time you get here.)

Land this **first**, with PR 1, so a reviewer of the module PRs can see why the new exports exist before they see the page that consumes them.

- [ ] **Step 1: Write the ADR**

Match the shape of a neighbouring file — read `docs/decisions/0031-applications-are-group-requests.md` first and follow its headings rather than the sketch below if they differ.

```markdown
# 0034 — Mein Konto splits into an overview and a settings page

Status: accepted
Date: 2026-09-06

## Context

`/account` was the only personal destination in the signed-in header, and it
rendered a settings form. Once a member had filled in their profile there was no
reason to open it again. Four alert banners could stack above the content; the
member's name carried the same visual weight as "Passwort ändern"; the page knew
the member's group slug and did not link it; and role grants — which the page
already had in `getCurrentMember().grants` — were never shown, so a member
learned they could organise events only by noticing a button.

## Decision

Split the surface.

- `/account` becomes a personal overview: a fixed identity column (status,
  group, joined date, roles) beside a content column carrying open items,
  upcoming event registrations, attendance, the group, and the profile record.
- `/account/einstellungen` becomes the settings surface: e-mail address,
  password, a reserved slot for notification preferences, and the GDPR export.

Only an `active` member gets the two-column page. Every other status, and a user
with no member row, gets a plain single column — correct, not designed. New
sign-ups pass through that path, so it stays on the live route.

Reads cross module boundaries through each module's `index.ts` (CLAUDE.md §1).
Two new read functions in `@bdas/events-module` and a shared role-label map in
`@bdas/members` are the whole cost. No new tables.

## Consequences

- The identity column permanently answers "who am I here and what may I do".
- Later blocks (files, notification preferences) slot into the content column
  and the fixed settings order without another restructuring.
- Two states of the page must be maintained instead of one.
- **Deliberately not built: session management.** Changing the password is the
  accepted remedy for a lost device. `auth_sessions` keeps recording `ip` and
  `user_agent`; nothing surfaces them, and no session list is planned.
- Notification preferences remain unbuilt, so
  `apps/web/content/faq/allgemein.ts:99` — which tells members they manage
  E-Mail-Präferenzen here — stays inaccurate until they ship.

## Alternatives considered

- **Keep one page, reorder it.** Smaller change, but the page stays long and the
  identity scrolls out of view.
- **A grid of tiles.** Looks most like a dashboard, but a tile is a promise of a
  destination, and the destinations (attendance history, files, role history) do
  not exist. Without them it is a grid of decorated text.
```

- [ ] **Step 2: Commit**

```bash
pnpm format
git add docs/decisions/0034-account-overview-and-settings.md
git commit -m "docs(decisions): ADR 0034 account overview and settings split"
```

---

## PR grouping

One module per PR (CLAUDE.md §4):

| PR | Tasks | Scope |
| --- | --- | --- |
| 1 | 9, 1, 2 | ADR 0034 first, then `modules/events` — the two read functions |
| 2 | 3 | `modules/members` — shared role labels, both board components updated |
| 3 | 4, 5, 6, 7, 8 | `apps/web` — overview, settings page, E2E |

Task 9 is written last in this document but committed first: the ADR explains
why PR 1's exports exist.

PR 2 is small enough to fold into PR 3, but that puts two modules in one PR. Ask before combining.

Run `/review` on each PR. PR 3 renders role grants to the member, so run `/security-review` on it as well even though it changes no auth code.

## Deferred, do not build here

- Active session list and revocation — **decided against**, not deferred (spec §2).
- E-Mail notification preferences — the settings page already reserves the slot; the follow-up adds the form and its storage only.
- `apps/web/content/faq/allgemein.ts:99` tells members they manage E-Mail-Präferenzen under "Mein Konto". That is untrue until the preferences ship. Raise it with the maintainer during PR 3 rather than silently editing the FAQ copy.
