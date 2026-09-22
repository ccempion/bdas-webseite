# Notifications Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness, security, and wiring defects found in the notifications-module review without expanding scope into a cross-module refactor.

**Architecture:** The notifications module subscribes to the core event bus and sends transactional email through a composed `Notifier`. The review exposed (a) the bus subscribers are only wired from auth actions, so a cold serverless instance whose first request is an event registration drops the publish silently; (b) the Resend driver discards the SDK's `{data, error}` result so failed sends are logged as `sent`; (c) template HTML is unescaped. We move boot to a single Next.js `instrumentation.ts` startup hook, make the Resend driver throw on error, escape template HTML, and fail loud on partial config. Two of the ten findings are deliberately deferred (perf, cross-module consolidation) and recorded as an ADR rather than coded.

**Tech Stack:** TypeScript, Next.js 14 (App Router, `instrumentation.ts`), Drizzle/Postgres, Resend SDK v4, Vitest.

---

## Scope

**In scope (correctness cluster):** findings 1, 2, 3, 4, 5, 8, 9.
**Deferred, recorded as ADR 0011:** finding 10 (Notifier/driver duplication vs `core/`).
**Explicitly NOT done in this plan:**

- Finding 6 (audit-row gap on resolver/insert error) — narrow; the existing test `index.test.ts:181` asserts a resolver throw writes **zero** rows, so changing it is a separate, deliberate decision. Held.
- Finding 7 (defer sends out of the request path via `after()`) — real perf cost but the module is flag-off / not in production; premature. Revisit when the flag goes on.

**Module-boundary note (CLAUDE.md "one module per PR"):** `modules/auth/src/notifier-resend.ts` has the _identical_ finding-2 bug (discards Resend's error result), so auth verification/reset mail also logs success on failure. It is **out of scope here** and must be fixed in a separate auth PR — see "Follow-ups" at the end. Do not edit the auth module in this plan.

**File structure:**

- `modules/notifications/src/templates.ts` — add private `escapeHtml`, escape HTML interpolations, fix German closing quotes. (findings 3, 9)
- `modules/notifications/src/templates.test.ts` — add escaping + typographic-quote tests.
- `modules/notifications/src/notifier-resend.ts` — throw on Resend error result. (finding 2)
- `modules/notifications/src/notifier-resend.test.ts` — **new** unit test, mocks the `resend` package.
- `apps/web/lib/notifications-bootstrap.ts` — flag-check before latch; fail loud on partial prod config. (findings 4, 5)
- `apps/web/instrumentation.ts` — **new** single boot point. (finding 1)
- `apps/web/next.config.mjs` — enable `instrumentationHook`; add `@bdas/notifications` to `transpilePackages`.
- `apps/web/app/{anmelden,registrieren,verifizierung-erneut-senden,passwort-zuruecksetzen}/actions.ts` — remove scattered `bootNotifications()` calls + imports. (finding 1)
- `docs/decisions/0007-scoped-role-grants.md` — remove dangling `result_sprint5.md` citation. (finding 8)
- `docs/decisions/0011-defer-email-consolidation.md` — **new** ADR. (finding 10)

---

### Task 1: Escape HTML in transactional templates (finding 3)

**Files:**

- Modify: `modules/notifications/src/templates.ts:40-47`
- Test: `modules/notifications/src/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `modules/notifications/src/templates.test.ts` inside `describe("render", ...)`:

```ts
it("escapes HTML in firstName and eventTitle in the html part", () => {
  const out = render("event_registration_confirmed", {
    firstName: "<img src=x onerror=alert(1)>",
    eventTitle: '<a href="https://evil.example">klick</a>',
  });
  // html part must not contain live markup from user input
  expect(out.html).not.toContain("<img");
  expect(out.html).not.toContain("<a href");
  expect(out.html).toContain("&lt;img");
  // text part is plain text (clients do not render it) — left raw
  expect(out.text).toContain("<img");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts -t "escapes HTML"`
Expected: FAIL — `out.html` contains `<img` / `<a href`.

- [ ] **Step 3: Add `escapeHtml` and apply it in `body()`**

In `modules/notifications/src/templates.ts`, replace the `body` function (lines 40-47) with:

```ts
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function body(subject: string, firstName: string, line: string): RenderedEmail {
  const text = `Hallo ${firstName},\n\n${line}\n\nViele Grüße\nDein BDAS-Team\n`;
  const html =
    `<p>Hallo ${escapeHtml(firstName)},</p>` +
    `<p>${escapeHtml(line)}</p>` +
    `<p>Viele Grüße<br>Dein BDAS-Team</p>`;
  return { subject, text, html };
}
```

(`line` already contains the interpolated `eventTitle`, so escaping `line` covers the event title; `text` stays raw — plain-text mail is not rendered as markup.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts`
Expected: PASS (all `render` tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add modules/notifications/src/templates.ts modules/notifications/src/templates.test.ts
git commit -m "fix(notifications): escape HTML in transactional email templates

Closes review finding 3: firstName/eventTitle were interpolated into the
HTML part unescaped, allowing HTML/link injection into BDAS mail.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Use German typographic closing quotes (finding 9)

**Files:**

- Modify: `modules/notifications/src/templates.ts:17,23,29,35`
- Test: `modules/notifications/src/templates.test.ts`

All four template strings open with `„` (U+201E) but close with an ASCII straight quote `"` (U+0022). German closes with `"` (U+201C).

- [ ] **Step 1: Write the failing test**

Add to `modules/notifications/src/templates.test.ts` inside `describe("render", ...)`:

```ts
  it("closes German quotes with U+201C, not an ASCII straight quote", () => {
    const out = render("event_registration_confirmed", {
      firstName: "Mara",
      eventTitle: "Sommerfest",
    });
    expect(out.text).toContain("„Sommerfest“"); // „Sommerfest“
    expect(out.text).not.toContain("„Sommerfest""); // not „Sommerfest"
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts -t "closes German quotes"`
Expected: FAIL — text contains `„Sommerfest"` (ASCII close).

- [ ] **Step 3: Replace the four closing quotes**

In `modules/notifications/src/templates.ts`, change the closing quote after each `${eventTitle}` from `"` to `"` (U+201C). The four occurrences:

- Line 17: `` `deine Anmeldung für „${eventTitle}" ist bestätigt. Wir freuen uns auf dich!` ``
  → `` `deine Anmeldung für „${eventTitle}" ist bestätigt. Wir freuen uns auf dich!` ``
- Line 23: `` `„${eventTitle}" ist aktuell ausgebucht. ...` ``
  → `` `„${eventTitle}" ist aktuell ausgebucht. ...` ``
- Line 29: `` `deine Abmeldung von „${eventTitle}" ist eingegangen. ...` ``
  → `` `deine Abmeldung von „${eventTitle}" ist eingegangen. ...` ``
- Line 35: `` `gute Nachrichten: Bei „${eventTitle}" ist ein Platz frei geworden ...` ``
  → `` `gute Nachrichten: Bei „${eventTitle}" ist ein Platz frei geworden ...` ``

Use Edit per line, matching `${eventTitle}"` → `${eventTitle}"` (the close char differs: U+0022 → U+201C). Each line's surrounding text makes the match unique.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/notifications/src/templates.ts modules/notifications/src/templates.test.ts
git commit -m "fix(notifications): use German typographic closing quote in templates

Closes review finding 9: all four templates closed „…“ with an ASCII
straight quote, rendering as „Sommerfest\" in recipients' clients.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Make the Resend driver throw on error result (finding 2)

**Files:**

- Modify: `modules/notifications/src/notifier-resend.ts:17-25`
- Test: `modules/notifications/src/notifier-resend.test.ts` (create)

Resend SDK v4 resolves with `{ data, error }` and does **not** throw on API errors. The current driver discards the result, so every Resend rejection (bad key, unverified domain, rate limit, invalid recipient) is logged by `send.ts` as `status='sent'`.

- [ ] **Step 1: Write the failing test**

Create `modules/notifications/src/notifier-resend.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createResendNotifier } from "./notifier-resend";

const email = {
  to: "x@example.org",
  subject: "Betreff",
  text: "Hallo",
  html: "<p>Hallo</p>",
} as const;

describe("createResendNotifier", () => {
  beforeEach(() => sendMock.mockReset());

  it("throws when Resend returns an error result", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(notifier.send(email)).rejects.toThrow("domain not verified");
  });

  it("resolves when Resend returns a success result", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(notifier.send(email)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/notifications exec vitest run src/notifier-resend.test.ts`
Expected: FAIL on "throws when Resend returns an error result" — current driver never throws.

- [ ] **Step 3: Throw on the error result**

In `modules/notifications/src/notifier-resend.ts`, replace the `send` method body (lines 17-25):

```ts
    async send(email: OutboundEmail): Promise<void> {
      const { error } = await client.emails.send({
        from: opts.from,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (error) throw new Error(error.message);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/notifications exec vitest run src/notifier-resend.test.ts`
Expected: PASS (both cases). The throw is caught by `services/send.ts` and recorded as a `'failed'` row.

- [ ] **Step 5: Commit**

```bash
git add modules/notifications/src/notifier-resend.ts modules/notifications/src/notifier-resend.test.ts
git commit -m "fix(notifications): fail on Resend error result instead of logging success

Closes review finding 2: Resend v4 resolves with {data,error}; the result
was discarded so failed sends were written to notification_log as 'sent'.
Driver now throws on error, which send.ts records as a 'failed' row.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Bootstrap — flag-check before latch + fail loud on partial prod config (findings 4, 5)

**Files:**

- Modify: `apps/web/lib/notifications-bootstrap.ts:22-46`

Two defects in `bootNotifications()`:

- **#4:** `booted = true` is set _before_ the flag check, so a process whose first call saw the flag off can never wire later. Latch only after wiring succeeds; check the flag first.
- **#5:** partial Resend config (flag on, but `RESEND_API_KEY` or `RESEND_FROM_EMAIL` missing) silently falls back to `consoleNotifier` while `notification_log` still records `'sent'`. Fail loud in production; keep the console fallback in dev/test.

> No app-level test harness exists in `apps/web` (no Vitest config), so this task verifies by typecheck + build. Standing up a Vitest harness for one function is out of scope.

- [ ] **Step 1: Rewrite the boot body**

In `apps/web/lib/notifications-bootstrap.ts`, replace lines 22-46 (the `bootNotifications` function body) with:

```ts
export function bootNotifications(): void {
  if (booted) return;
  if (!isFlagOn("notifications")) return; // not latched: can boot later if the flag flips

  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM_EMAIL"];
  if (apiKey && from) {
    setNotifier(createResendNotifier({ apiKey, from }));
  } else if (process.env.NODE_ENV === "production") {
    // Flag-on production with partial config would silently print to stdout
    // while notification_log records 'sent'. Fail loud instead.
    throw new Error(
      "[notifications] flag is on but RESEND_API_KEY and RESEND_FROM_EMAIL are not both set",
    );
  } else {
    setNotifier(consoleNotifier);
  }

  setRecipientResolver({
    async resolve(db: Db, memberId: string): Promise<RecipientContact | null> {
      const member = await getMember(db, memberId);
      if (!member) return null;
      // `getUserExport` is reused as a contact lookup for this slice; it returns
      // the full GDPR-export shape. Follow-up: add a dedicated
      // `auth.getUserContact` when auth email is reconciled into notifications.
      const user = await getUserExport(db, member.userId);
      if (!user) return null;
      return { email: user.email, firstName: member.firstName };
    },
  });

  registerNotificationSubscribers(getDb());

  booted = true; // latch only after wiring succeeded
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @bdas/web exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/notifications-bootstrap.ts
git commit -m "fix(web): notifications boot checks flag before latching, fails loud on partial config

Closes review findings 4 and 5: booted latched before the flag check (a
flag-off cold start could never wire later); partial Resend config silently
fell back to consoleNotifier while logging 'sent'. Now latches only after
successful wiring and throws in production on partial config.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Single boot point via `instrumentation.ts`; remove scattered auth-action calls (finding 1)

**Files:**

- Create: `apps/web/instrumentation.ts`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/app/anmelden/actions.ts` (remove import line 13, call line 26)
- Modify: `apps/web/app/registrieren/actions.ts` (remove import line 12, call line 25)
- Modify: `apps/web/app/verifizierung-erneut-senden/actions.ts` (remove import line 8, call line 20)
- Modify: `apps/web/app/passwort-zuruecksetzen/actions.ts` (remove import line 17, calls lines 30 and 64)

`bootNotifications()` is currently called only from the four auth actions, so the bus subscribers exist only on an instance an auth action warmed first. A cold instance whose first request is an event registration publishes to a bus with zero subscribers — no email, no log, no error. Move boot to Next's `register()` startup hook (runs once per server process, before any request) and delete the scattered calls.

- [ ] **Step 1: Create the instrumentation hook**

Create `apps/web/instrumentation.ts`:

```ts
/**
 * Next.js startup hook (App Router). Runs once per server process before any
 * request is served. We boot the notifications module here so its bus
 * subscribers are wired regardless of which route warms the instance first
 * (review finding 1). The Edge runtime cannot run the DB/notifier stack, so we
 * gate on the Node runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootNotifications } = await import("./lib/notifications-bootstrap");
    bootNotifications();
  }
}
```

- [ ] **Step 2: Enable the instrumentation hook and transpile the module**

In `apps/web/next.config.mjs`, inside the `experimental` block, add `instrumentationHook: true` (Next 14 requires the flag — it is stable in Next 15). Also add `"@bdas/notifications"` to `transpilePackages` (every other `@bdas/*` workspace is listed; this one is imported by the new server entry point and must be transpiled from TS source).

`experimental` block becomes:

```js
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@node-rs/argon2"],
    instrumentationHook: true,
    // Trace from the monorepo root so hoisted deps get included
    // in the deployed function bundle (pnpm + Vercel monorepo support).
    outputFileTracingRoot: monorepoRoot,
  },
```

And add `"@bdas/notifications",` to the `transpilePackages` array (e.g. after `"@bdas/members",`).

- [ ] **Step 3: Remove the call + import from `anmelden/actions.ts`**

Delete line 13 (`import { bootNotifications } from "../../lib/notifications-bootstrap";`) and line 26 (`  bootNotifications();`).

- [ ] **Step 4: Remove the call + import from `registrieren/actions.ts`**

Delete line 12 (the import) and line 25 (`  bootNotifications();`).

- [ ] **Step 5: Remove the call + import from `verifizierung-erneut-senden/actions.ts`**

Delete line 8 (the import) and line 20 (`  bootNotifications();`).

- [ ] **Step 6: Remove the import + both calls from `passwort-zuruecksetzen/actions.ts`**

Delete line 17 (the import) and both call sites (lines 30 and 64, each `  bootNotifications();`).

- [ ] **Step 7: Verify no `bootNotifications` callers remain except instrumentation**

Run: `grep -rn "bootNotifications" apps/web --include="*.ts"`
Expected: only `apps/web/instrumentation.ts` (the dynamic import) and `apps/web/lib/notifications-bootstrap.ts` (the definition). No `app/**/actions.ts` matches.

- [ ] **Step 8: Typecheck and build**

Run: `pnpm --filter @bdas/web exec tsc --noEmit && pnpm --filter @bdas/web build`
Expected: PASS. (The `notifications` flag is off in production, so `register()` boots then returns early — no behavior change in prod; this only relocates wiring.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/instrumentation.ts apps/web/next.config.mjs apps/web/app/anmelden/actions.ts apps/web/app/registrieren/actions.ts apps/web/app/verifizierung-erneut-senden/actions.ts apps/web/app/passwort-zuruecksetzen/actions.ts
git commit -m "fix(web): boot notifications once at startup via instrumentation.ts

Closes review finding 1: bootNotifications() was only called from the four
auth actions, so a cold instance whose first request was an event
registration published to a bus with zero subscribers (dropped silently).
Boot now runs once in the Next register() hook; scattered per-action calls
removed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Remove dangling `result_sprint5.md` citation from ADR 0007 (finding 8)

**Files:**

- Modify: `docs/decisions/0007-scoped-role-grants.md:30-31`

`docs/result_sprint5.md` was deleted (commit `4c9361c`). Verified via git history: the `text[]` repayment obligation only ever lived in this ADR sentence — `result_sprint5.md` never contained it — so the citation is a dead pointer. Drop the citation; keep the obligation stated inline (ADRs are rank-1 source of truth).

- [ ] **Step 1: Rewrite the sentence**

In `docs/decisions/0007-scoped-role-grants.md`, replace:

```
The `text[]` column was a deliberate Sprint-3 shortcut, flagged for repayment
in `docs/result_sprint5.md`. This ADR records how the spec's already-decided
```

with:

```
The `text[]` column was a deliberate Sprint-3 shortcut; repaying it means
normalizing scoped grants into a dedicated join table before the grant model
is treated as final. (The originating Sprint-3 note has since been removed, so
this ADR is now the record of that obligation.) This ADR records how the
spec's already-decided
```

- [ ] **Step 2: Verify no dangling reference remains**

Run: `grep -rn "result_sprint" docs/decisions/`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0007-scoped-role-grants.md
git commit -m "docs(adr-0007): inline text[] repayment note, drop deleted-doc citation

Closes review finding 8: ADR 0007 cited docs/result_sprint5.md, which was
deleted. The repayment obligation only ever lived in this ADR; the citation
is now inline.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Record the deferred email-consolidation decision as ADR 0011 (finding 10)

**Files:**

- Create: `docs/decisions/0011-defer-email-consolidation.md`

Finding 10 is correct that `auth` and `notifications` each carry their own `Notifier`/Resend driver — structurally duplicating an email concern that CLAUDE.md rule 4 says belongs in `core/`. We are **not** refactoring two modules mid-phase (that is the opposite of simple, and auth-email absorption is already deferred per the build plan). The real governance gap the finding names is that no ADR records the deferral. This task closes that gap.

- [ ] **Step 1: Write the ADR**

Create `docs/decisions/0011-defer-email-consolidation.md`:

```markdown
# 0011 — Defer consolidation of the email/Notifier concern into core/

- Status: Accepted
- Date: 2026-06-11
- Supersedes: —

## Context

Two modules independently implement an email-sending stack:

- `modules/auth/src/notifier.ts` + `notifier-resend.ts` (fixed message kinds:
  verify, password-reset)
- `modules/notifications/src/notifier.ts` + `notifier-resend.ts` (carries an
  already-rendered subject/text/html)

CLAUDE.md §1 rule 4 says shared concerns belong in `core/`. A review (2026-06)
flagged the duplication: any Resend behavior change (idempotency keys, retries,
the error-handling fix, a GDPR-mandated footer) must be applied in two drivers
and two composition sites and will drift.

The two `Notifier` interfaces are not identical: auth's takes a typed
`AuthMessage` and renders internally; notifications' takes a pre-rendered
`OutboundEmail`. A correct shared abstraction must reconcile these, which is
coupled to the planned "auth-email absorption into notifications" work that the
build plan already defers.

## Decision

Keep the two stacks separate for now. Do **not** extract a shared `core/email`
concern in the notifications review-fix PR. Consolidation is deferred until the
auth-email absorption work, at which point a single `core/email` Notifier +
Resend driver + composition seam will be introduced and both modules migrated.

Correctness fixes that apply to both drivers (e.g. throwing on Resend's error
result) are applied per-module in the meantime; the auth driver's identical
error-discard bug is tracked as a separate auth PR.

## Consequences

- Short term: one known duplication, accepted and recorded here rather than
  silently carried.
- The error-handling fix from the 2026-06 review lives in
  `modules/notifications` now and must be mirrored into `modules/auth`
  separately (tracked as a follow-up).
- When consolidation happens, this ADR is the entry point; the unified concern
  supersedes both per-module drivers.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0011-defer-email-consolidation.md
git commit -m "docs(adr-0011): record deferred email/Notifier consolidation into core/

Closes review finding 10: auth and notifications duplicate the Resend driver;
rule 4 wants it in core/. Consolidation is coupled to the deferred auth-email
absorption, so we record the deferral as an ADR rather than refactor two
modules mid-phase.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run the notifications unit tests**

Run: `pnpm --filter @bdas/notifications exec vitest run src/templates.test.ts src/notifier-resend.test.ts`
Expected: PASS. (Integration tests in `index.test.ts` skip without `DATABASE_URL`; they are unaffected — `send.ts` behavior is unchanged and the fake Notifier still throws/succeeds as before.)

- [ ] **Step 2: Typecheck + build the app**

Run: `pnpm --filter @bdas/web exec tsc --noEmit && pnpm --filter @bdas/web build`
Expected: PASS.

- [ ] **Step 3: Confirm scope discipline**

Run: `git diff --name-only main -- modules/auth`
Expected: no output (the auth module was not touched — its identical bug is a separate PR).

---

## Follow-ups (NOT in this plan)

1. **Auth Resend driver (finding 2, mirror):** `modules/auth/src/notifier-resend.ts` discards Resend's `{data,error}` result identically — auth verification/reset mail logs success on failure. Fix in a dedicated auth PR (one module per PR). Note auth's `send` is awaited directly in auth actions, so making it throw is a behavior change there — verify the action error paths before merging.
2. **Finding 6 (audit invariant):** decide whether a resolver error or a post-send insert failure should write a `'failed'` row. Changing it breaks the current `index.test.ts:181` contract (resolver throw → zero rows), so it is a deliberate, separately-reviewed decision.
3. **Finding 7 (defer sends):** when the `notifications` flag is turned on, move `sendTransactional` out of the request path with `after()`/`waitUntil` and carry `eventTitle` in the published event payload to drop the per-registration DB round trips + Resend latency.

---

## Self-Review

- **Spec coverage:** findings 1 (Task 5), 2 (Task 3), 3 (Task 1), 4 (Task 4), 5 (Task 4), 8 (Task 6), 9 (Task 2), 10 (Task 7). Findings 6 and 7 explicitly deferred with rationale. All ten accounted for.
- **Placeholder scan:** every code/edit step contains complete code or an exact char-level change; no TBD/"handle errors"/"similar to" placeholders.
- **Type consistency:** `escapeHtml(s: string): string`, `bootNotifications(): void`, `register(): Promise<void>`, and the `Notifier.send(email: OutboundEmail): Promise<void>` signature match across tasks and the existing module surface (`notifier.ts`, `index.ts`).

```

```
