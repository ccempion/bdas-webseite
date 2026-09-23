# Konto-Löschung — PR3: Lösch-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a signed-in user the actual "Konto löschen" path: a button + confirmation dialog in `/account/einstellungen`, the Server Action that locks the account, revokes sessions, creates the deletion request, and sends the confirmation mail (Email A), and the `/konto-reaktivieren/[token]` route that lets them cancel it within the 30-day window. No module-side hard-deletion (blog/files/events — PR4/5/6), no cron sweep, no orchestrator (PR8) yet.

**Architecture:** This PR is `apps/web` composition, not a new module — it wires together `auth`'s `requestAccountDeletion`/`cancelAccountDeletion`/`buildReactivationUrl` (PR1) and `notifications`'s `sendTransactional` + `account_deletion_requested` template (PR2). The confirmation dialog follows the existing `Dialog.tsx` primitive (no native `confirm()`, spec §4.1); the Server Action follows the exact shape of `password-actions.ts`/`email-actions.ts` (flag checks, boot calls, `isAppError` handling, a best-effort notification send that never fails the whole action). The reactivation route follows `verifizieren/[token]/route.ts`'s shape (a route handler, not a Server Component, redirecting to a status page with a `?status=` query param) — but unlike email verification, it deliberately does **not** set a session cookie: the link is meant to be opened from whatever device has the mailbox, and handing that device a live session would defeat the point of a security check that already assumes the browser making the request might not be the account owner's.

**A testability gap this plan closes first (Task 1):** the reactivation token is hashed at rest (PR1's deliberate security fix), so — unlike the existing password-reset/email-verification e2e tests, which read the plaintext token straight out of the database — there is no DB column this plan can read the token from. The token only ever exists in the sent email. This plan adds a small, env-gated "last sent email" capture (`E2E_EMAIL_CAPTURE`, never set outside `playwright.config.ts`), so the e2e test in Task 5 can retrieve the real reactivation link the way a person would (by reading their email), not by reaching around the security boundary. This is reusable test infrastructure, not a one-off hack — the same capture will serve PR7's data-export email.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Actions, Route Handlers), Vitest (mocked unit tests for Server Action logic, matching `self-service-group.actions.test.ts`'s precedent — the underlying service calls are already integration-tested in PR1/PR2), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-22-account-deletion-design.md` — this plan implements §4 (Ablauf Tag 0), the reactivation half of Entscheidung 4, and the UI/flag half of §9.

## Global Constraints

- Rule 6 (CLAUDE.md §1): the `account_deletion` flag (already added in PR1) gates the button, both new routes, and the settings-page card — independent of `auth`'s own flag, per spec §9 ("unabhängig von auth/members").
- The confirmation dialog is the existing `Dialog` primitive (`@bdas/design-system`) — never a native `confirm()`/`alert()` (spec §4.1).
- No new design tokens: the design system has no "danger"/"destructive" button variant. The dialog's final confirm button uses `variant="primary"` (already brand red `bg-bdas-red`) rather than inventing one — that red is reserved by CLAUDE.md §7 for exactly this kind of active/critical-action state.
- The reactivation route must not create a session. Cancelling a deletion restores `auth_users.status = 'active'`; it must not also hand the clicking browser a live cookie.
- Every AppError from `requestAccountDeletion`/`cancelAccountDeletion` is surfaced via `isAppError(err)` → `err.message`, matching `password-actions.ts`/`email-actions.ts` exactly — no new error-message mapping layer.
- A failed confirmation-email send must never fail the deletion request itself (the deletion already committed) — same non-fatal-notify pattern as `changePassword`/`requestEmailChange`.
- `E2E_EMAIL_CAPTURE` must be inert outside of `playwright.config.ts`'s controlled env: gated on the explicit env var, with `VERCEL_ENV !== "production"` as a second, independent guard (this codebase's actual "are we really in production" signal — `NODE_ENV` is not: `next start`, which the e2e suite runs, sets `NODE_ENV=production` on its own).
- **New CLAUDE.md rule (added after PR1/PR2, first applies here):** "Executed plans and specs move to `docs/archive/superpowers/` in the last commit of the PR they describe." Grep the ADRs and module READMEs for this plan's filename before archiving it (Task 6) and rewrite any reference in the same commit — the archive is excluded from search via `.ignore`, so a stale link is the failure mode that matters. The overarching spec (`2026-09-22-account-deletion-design.md`) stays at its live path until the whole feature (all its PRs) is done — only this PR's own plan file moves.
- Per user memory: run `pnpm format` before every commit.

---

### Task 1: E2E email-capture infrastructure

**Files:**

- Create: `apps/web/lib/e2e-email-capture.ts`
- Modify: `apps/web/lib/notifications-bootstrap.ts`
- Create: `apps/web/app/api/e2e/last-email/route.ts`
- Modify: `e2e/helpers/flows.ts`
- Modify: `playwright.config.ts`
- Test: `apps/web/lib/e2e-email-capture.test.ts`

**Interfaces:**

- Produces: `e2eEmailCaptureEnabled(): boolean`; `withE2ECapture(notifier: Notifier): Notifier` (passthrough when disabled); `getCapturedEmail(to: string): OutboundEmail | undefined`.
- Consumes: `Notifier`, `OutboundEmail` from `@bdas/notifications`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/e2e-email-capture.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Notifier, OutboundEmail } from "@bdas/notifications";

import { e2eEmailCaptureEnabled, getCapturedEmail, withE2ECapture } from "./e2e-email-capture";

const ORIGINAL_ENV = { ...process.env };

describe("e2e email capture", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("e2eEmailCaptureEnabled", () => {
    it("is false with no env vars set", () => {
      delete process.env["E2E_EMAIL_CAPTURE"];
      delete process.env["VERCEL_ENV"];
      expect(e2eEmailCaptureEnabled()).toBe(false);
    });

    it("is true when the capture flag is on and it's not production", () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      expect(e2eEmailCaptureEnabled()).toBe(true);
    });

    it("is false in production even with the capture flag on", () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      process.env["VERCEL_ENV"] = "production";
      expect(e2eEmailCaptureEnabled()).toBe(false);
    });
  });

  describe("withE2ECapture", () => {
    let sent: OutboundEmail[];
    let inner: Notifier;

    beforeEach(() => {
      sent = [];
      inner = {
        async send(email: OutboundEmail): Promise<void> {
          sent.push(email);
        },
      };
    });

    it("passes sends through to the wrapped notifier unchanged when disabled", async () => {
      delete process.env["E2E_EMAIL_CAPTURE"];
      const wrapped = withE2ECapture(inner);
      const email = { to: "a@example.org", subject: "s", text: "t", html: "<p>t</p>" };

      await wrapped.send(email);

      expect(sent).toEqual([email]);
      expect(getCapturedEmail("a@example.org")).toBeUndefined();
    });

    it("captures the email by recipient and still forwards it when enabled", async () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      const wrapped = withE2ECapture(inner);
      const email = { to: "B@Example.org", subject: "s", text: "t", html: "<p>t</p>" };

      await wrapped.send(email);

      expect(sent).toEqual([email]);
      expect(getCapturedEmail("b@example.org")).toEqual(email);
    });

    it("keeps only the most recent email per recipient", async () => {
      process.env["E2E_EMAIL_CAPTURE"] = "true";
      delete process.env["VERCEL_ENV"];
      const wrapped = withE2ECapture(inner);
      await wrapped.send({ to: "a@example.org", subject: "first", text: "t", html: "<p>t</p>" });
      await wrapped.send({ to: "a@example.org", subject: "second", text: "t", html: "<p>t</p>" });

      expect(getCapturedEmail("a@example.org")?.subject).toBe("second");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test e2e-email-capture`
Expected: FAIL — `./e2e-email-capture` does not exist.

- [ ] **Step 3: Write `e2e-email-capture.ts`**

Create `apps/web/lib/e2e-email-capture.ts`:

```ts
/**
 * Test-only capture of the last email sent to each recipient, for e2e specs
 * that need to read a link a real email would carry (the reactivation token
 * in PR3, the data-export attachment in a later PR) without reaching around
 * a deliberate security boundary — this codebase's reactivation and
 * password-reset tokens are hashed at rest, so no DB column has the
 * plaintext to read back.
 *
 * Backed by globalThis (Symbol.for), same reason as notifications' own
 * Notifier/RecipientResolver: Next.js can run a Server Action and a route
 * handler in different module instances of the same server process.
 *
 * Gated on `E2E_EMAIL_CAPTURE`, with `VERCEL_ENV !== "production"` as an
 * independent second guard — `NODE_ENV` is not a safe signal here, since
 * `next start` (which the e2e suite runs against) sets it to `"production"`
 * regardless of environment.
 */
import type { Notifier, OutboundEmail } from "@bdas/notifications";

const CAPTURE_KEY = Symbol.for("@bdas/web:e2e-email-capture");
type CaptureStore = { [CAPTURE_KEY]?: Map<string, OutboundEmail> };

function captureMap(): Map<string, OutboundEmail> {
  const store = globalThis as unknown as CaptureStore;
  return (store[CAPTURE_KEY] ??= new Map());
}

export function e2eEmailCaptureEnabled(): boolean {
  return process.env["E2E_EMAIL_CAPTURE"] === "true" && process.env["VERCEL_ENV"] !== "production";
}

/** No-op passthrough when capture is disabled — zero behavior change in production. */
export function withE2ECapture(notifier: Notifier): Notifier {
  if (!e2eEmailCaptureEnabled()) return notifier;
  return {
    async send(email: OutboundEmail): Promise<void> {
      captureMap().set(email.to.toLowerCase(), email);
      await notifier.send(email);
    },
  };
}

export function getCapturedEmail(to: string): OutboundEmail | undefined {
  return captureMap().get(to.toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test e2e-email-capture`
Expected: PASS (6/6)

- [ ] **Step 5: Wrap the notifier in `notifications-bootstrap.ts`**

In `apps/web/lib/notifications-bootstrap.ts`, add the import:

```ts
import { withE2ECapture } from "./e2e-email-capture";
```

Replace the notifier-selection block:

```ts
const apiKey = process.env["RESEND_API_KEY"];
const from = process.env["RESEND_FROM_EMAIL"];
if (apiKey && from) {
  setNotifier(createResendNotifier({ apiKey, from }));
} else if (process.env["VERCEL_ENV"] === "production") {
  // Flag-on production with partial config would silently print to stdout
  // while notification_log records 'sent'. Fail loud instead.
  throw new Error(
    "[notifications] flag is on but RESEND_API_KEY and RESEND_FROM_EMAIL are not both set",
  );
} else {
  setNotifier(consoleNotifier);
}
```

with:

```ts
const apiKey = process.env["RESEND_API_KEY"];
const from = process.env["RESEND_FROM_EMAIL"];
let notifier;
if (apiKey && from) {
  notifier = createResendNotifier({ apiKey, from });
} else if (process.env["VERCEL_ENV"] === "production") {
  // Flag-on production with partial config would silently print to stdout
  // while notification_log records 'sent'. Fail loud instead.
  throw new Error(
    "[notifications] flag is on but RESEND_API_KEY and RESEND_FROM_EMAIL are not both set",
  );
} else {
  notifier = consoleNotifier;
}
setNotifier(withE2ECapture(notifier));
```

- [ ] **Step 6: Add the debug endpoint**

Create `apps/web/app/api/e2e/last-email/route.ts`:

```ts
import { NextResponse } from "next/server";

import { e2eEmailCaptureEnabled, getCapturedEmail } from "../../../../lib/e2e-email-capture";

/**
 * Test-only. Returns the last captured email sent to `?to=`, or 404 if
 * capture is disabled (always the case outside the e2e suite's own env —
 * see e2e-email-capture.ts) or nothing has been captured for that address.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!e2eEmailCaptureEnabled()) return new NextResponse("Not Found", { status: 404 });

  const to = new URL(request.url).searchParams.get("to");
  if (!to) return NextResponse.json({ error: "missing ?to=" }, { status: 400 });

  const email = getCapturedEmail(to);
  if (!email) return NextResponse.json({ error: "no captured email" }, { status: 404 });

  return NextResponse.json(email);
}
```

- [ ] **Step 7: Add the e2e helper**

In `e2e/helpers/flows.ts`, add after the existing imports:

```ts
type CapturedEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};
```

Add near the bottom of the file, after `submitAndSettle`:

```ts
/** Reads the last email the app sent to `to`, via the e2e-only capture
 *  endpoint (apps/web/lib/e2e-email-capture.ts) — the real substitute for
 *  reading a token straight out of the database, for tokens the DB only
 *  stores hashed. */
export async function lastEmailTo(page: Page, to: string): Promise<CapturedEmail> {
  const res = await page.request.get(`/api/e2e/last-email?to=${encodeURIComponent(to)}`);
  if (!res.ok()) {
    throw new Error(`no captured email for ${to} (status ${res.status()}): ${await res.text()}`);
  }
  return res.json();
}

/** Pulls the reactivation token out of an account-deletion-requested email's
 *  plain-text body (the link is the only URL that template ever emits). */
export function extractReactivationToken(emailText: string): string {
  const match = emailText.match(/\/konto-reaktivieren\/([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`no reactivation link found in email text: ${emailText}`);
  return match[1];
}
```

- [ ] **Step 8: Enable the flags and capture in `playwright.config.ts`**

In `playwright.config.ts`, add to `APP_ENV`:

```ts
  BDAS_FLAG_NEWSLETTER: "true",
  BDAS_FLAG_NOTIFICATIONS: "true",
  BDAS_FLAG_ACCOUNT_DELETION: "true",
  E2E_EMAIL_CAPTURE: "true",
```

(replacing the single existing `BDAS_FLAG_NEWSLETTER: "true",` line with these four).

- [ ] **Step 9: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
pnpm format
git add apps/web/lib/e2e-email-capture.ts apps/web/lib/e2e-email-capture.test.ts apps/web/lib/notifications-bootstrap.ts apps/web/app/api/e2e/last-email/route.ts e2e/helpers/flows.ts playwright.config.ts
git commit -m "test(e2e): add env-gated last-sent-email capture

Needed because the reactivation token (like the password-reset token) is
hashed at rest, so no DB column has the plaintext an e2e spec could read.
Reusable for any future PR whose e2e coverage needs to read a link or
attachment out of a sent transactional email.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `requestAccountDeletionAction` Server Action

**Files:**

- Create: `apps/web/app/_account-deletion/flag.ts`
- Create: `apps/web/app/account/delete-account-actions.ts`
- Test: `apps/web/app/account/delete-account-actions.test.ts`

**Interfaces:**

- Consumes: `requestAccountDeletion`, `buildReactivationUrl` from `@bdas/auth` (PR1); `sendTransactional` from `@bdas/notifications` (PR2); `getCurrentMember` from `@bdas/members`; `clearSessionCookie`, `readSessionCookie` from `../../lib/auth-cookie`; `formatDate` from `../../lib/format`.
- Produces: `accountDeletionEnabled(): boolean`, `requireAccountDeletionFlag(): void`; `requestAccountDeletionAction(): Promise<{ok?: true; error?: string}>`.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/app/account/delete-account-actions.test.ts`:

```ts
/**
 * Mocked unit test for the Server Action's own logic (flag checks, display
 * name construction, error surfacing, session-clearing, non-fatal email
 * send) — same style as self-service-group.actions.test.ts. The underlying
 * service calls (requestAccountDeletion, sendTransactional) already have
 * their own real-Postgres integration tests in PR1/PR2; this test verifies
 * the wiring between them, not their internals.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@bdas/errors";
import type { CurrentMember } from "@bdas/members";

const requestAccountDeletion = vi.fn();
const buildReactivationUrl = vi.fn(
  (base: string, token: string) => `${base}/konto-reaktivieren/${token}`,
);
const sendTransactional = vi.fn();
const clearSessionCookie = vi.fn();
let currentMember: CurrentMember | null = null;

vi.mock("@bdas/db", () => ({ getDb: () => ({}) }));
vi.mock("@bdas/feature-flags", () => ({ requireFlag: () => {} }));
vi.mock("@bdas/auth", () => ({
  requestAccountDeletion: (...a: unknown[]) => requestAccountDeletion(...a),
  buildReactivationUrl: (...a: [string, string]) => buildReactivationUrl(...a),
}));
vi.mock("@bdas/members", () => ({ getCurrentMember: async () => currentMember }));
vi.mock("@bdas/notifications", () => ({
  sendTransactional: (...a: unknown[]) => sendTransactional(...a),
}));
vi.mock("../../lib/auth-bootstrap", () => ({ bootAuth: () => {} }));
vi.mock("../../lib/notifications-bootstrap", () => ({ bootNotifications: () => {} }));
vi.mock("../../lib/auth-cookie", () => ({
  readSessionCookie: () => undefined,
  clearSessionCookie: () => clearSessionCookie(),
}));

import { requestAccountDeletionAction } from "./delete-account-actions";

function member(overrides: Partial<CurrentMember> = {}): CurrentMember {
  return {
    user: {
      id: "usr_1",
      email: "mara@example.org",
      status: "active",
      roles: [],
      sessionId: "ses_1",
    },
    member: {
      id: "mbr_1",
      userId: "usr_1",
      firstName: "Mara",
      lastName: "Beispiel",
      primaryGroupId: null,
      status: "active",
      joinedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    grants: [],
    primaryGroupKind: null,
    hasGroupScope: false,
    isBdasMember: true,
    ...overrides,
  };
}

describe("requestAccountDeletionAction", () => {
  beforeEach(() => {
    requestAccountDeletion.mockReset();
    sendTransactional.mockReset().mockResolvedValue({ status: "sent", logId: "ntfy_1" });
    clearSessionCookie.mockReset();
    currentMember = member();
  });

  it("requires an authenticated session", async () => {
    currentMember = null;

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ error: "Anmeldung erforderlich." });
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("requires a member profile", async () => {
    currentMember = member({ member: null });

    const res = await requestAccountDeletionAction();

    expect(res.error).toMatch(/Profildaten/);
    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("requests deletion with the member's display name, sends the confirmation email, and clears the session", async () => {
    requestAccountDeletion.mockResolvedValue({
      requestId: "adr_1",
      scheduledPurgeAt: new Date("2026-10-22T00:00:00Z"),
      reactivationToken: "tok_abc",
    });

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ ok: true });
    expect(requestAccountDeletion).toHaveBeenCalledWith(expect.anything(), {
      userId: "usr_1",
      displayName: "Mara Beispiel",
    });
    expect(sendTransactional).toHaveBeenCalledWith(
      expect.anything(),
      "account_deletion_requested",
      "mbr_1",
      expect.objectContaining({ reactivationUrl: expect.stringContaining("tok_abc") }),
    );
    expect(clearSessionCookie).toHaveBeenCalledTimes(1);
  });

  it("surfaces an AppError message without clearing the session", async () => {
    requestAccountDeletion.mockRejectedValue(
      new ConflictError("Für dieses Konto ist bereits eine Löschung angefragt."),
    );

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ error: "Für dieses Konto ist bereits eine Löschung angefragt." });
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("rethrows a non-AppError", async () => {
    requestAccountDeletion.mockRejectedValue(new Error("db exploded"));

    await expect(requestAccountDeletionAction()).rejects.toThrow("db exploded");
  });

  it("still clears the session and reports success when the confirmation email fails to send", async () => {
    requestAccountDeletion.mockResolvedValue({
      requestId: "adr_1",
      scheduledPurgeAt: new Date("2026-10-22T00:00:00Z"),
      reactivationToken: "tok_abc",
    });
    sendTransactional.mockRejectedValue(new Error("resend down"));

    const res = await requestAccountDeletionAction();

    expect(res).toEqual({ ok: true });
    expect(clearSessionCookie).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/web test delete-account-actions`
Expected: FAIL — `./delete-account-actions` does not exist.

- [ ] **Step 3: Write the flag helper**

Create `apps/web/app/_account-deletion/flag.ts`:

```ts
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * For embedding in someone else's page (the settings-page card): ask this
 * and render null, never `requireAccountDeletionFlag` — a 404 here would
 * take the whole settings page away over a switched-off side feature (same
 * reasoning as `newsletterEnabled`/`requireNewsletterFlag`).
 */
export function accountDeletionEnabled(): boolean {
  return isFlagOn("account_deletion");
}

/** For account-deletion-OWNED routes only (/konto-reaktivieren, /konto-loeschung-angefragt). */
export function requireAccountDeletionFlag(): void {
  if (!accountDeletionEnabled()) notFound();
}
```

- [ ] **Step 4: Write `delete-account-actions.ts`**

Create `apps/web/app/account/delete-account-actions.ts`:

```ts
"use server";

import { buildReactivationUrl, requestAccountDeletion } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { sendTransactional } from "@bdas/notifications";

import { bootAuth } from "../../lib/auth-bootstrap";
import { clearSessionCookie, readSessionCookie } from "../../lib/auth-cookie";
import { formatDate } from "../../lib/format";
import { bootNotifications } from "../../lib/notifications-bootstrap";

export type RequestAccountDeletionState = {
  readonly ok?: true;
  readonly error?: string;
};

export async function requestAccountDeletionAction(): Promise<RequestAccountDeletionState> {
  requireFlag("auth");
  requireFlag("account_deletion");
  bootAuth();
  bootNotifications();

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me) return { error: "Anmeldung erforderlich." };
  if (!me.member) {
    return { error: "Es fehlen Profildaten für die Löschung. Bitte wende dich an den Vorstand." };
  }

  const displayName = `${me.member.firstName} ${me.member.lastName}`.trim();

  let result;
  try {
    result = await requestAccountDeletion(db, { userId: me.user.id, displayName });
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }

  const reactivationUrl = buildReactivationUrl(
    process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
    result.reactivationToken,
  );

  // The deletion already committed — a failed confirmation mail must not
  // tell the user their request didn't go through. Same pattern as
  // changePassword/requestEmailChange.
  try {
    await sendTransactional(db, "account_deletion_requested", me.member.id, {
      reactivationUrl,
      scheduledPurgeDate: formatDate(result.scheduledPurgeAt),
    });
  } catch (err) {
    console.error("[account-deletion] request confirmation email failed:", err);
  }

  // Every session was revoked by the request, this one included. Clearing
  // the now-stale cookie logs the browser out to match server-side state.
  clearSessionCookie();

  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bdas/web test delete-account-actions`
Expected: PASS (6/6)

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
pnpm format
git add apps/web/app/_account-deletion/flag.ts apps/web/app/account/delete-account-actions.ts apps/web/app/account/delete-account-actions.test.ts
git commit -m "feat(web): add requestAccountDeletionAction

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `DeleteAccountCard` UI + settings page wiring

**Files:**

- Create: `apps/web/app/account/DeleteAccountCard.tsx`
- Modify: `apps/web/app/account/einstellungen/page.tsx`

**Interfaces:**

- Consumes: `requestAccountDeletionAction` (Task 2); `accountDeletionEnabled` (Task 2); `Alert`, `Button`, `Card`, `Dialog` from `@bdas/design-system`.

No isolated unit test — this is a client component whose behavior (dialog open/close, pending state, error display, redirect) is exercised by Task 5's e2e spec, matching how `WithdrawChangeButton.tsx` and `ChangePasswordCard.tsx` have no component-level tests of their own either.

- [ ] **Step 1: Write `DeleteAccountCard.tsx`**

Create `apps/web/app/account/DeleteAccountCard.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, Button, Card, Dialog } from "@bdas/design-system";

import { requestAccountDeletionAction } from "./delete-account-actions";

export function DeleteAccountCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card flat className="p-6">
      <h2 className="mb-2 text-lg font-semibold text-bdas-ink">Konto löschen</h2>
      <p className="mb-4 text-sm text-bdas-ink-body">
        Dein Konto wird gesperrt und nach 30 Tagen unwiderruflich gelöscht, einschließlich deiner
        Blogbeiträge und Kommentare. Innerhalb dieser Frist kannst du die Löschung über einen Link
        in der Bestätigungs-E-Mail abbrechen.
      </p>
      {error ? (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Konto löschen
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Konto wirklich löschen?">
        <p className="mb-4 text-sm text-bdas-ink-body">
          Dein Konto wird sofort gesperrt und in 30 Tagen unwiderruflich gelöscht — einschließlich
          deiner Blogbeiträge und Kommentare. Du bekommst eine E-Mail mit einem Link, über den du
          die Löschung innerhalb dieser Frist noch abbrechen kannst.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await requestAccountDeletionAction();
                if (!res.ok) {
                  setError(res.error ?? "Fehler");
                  setOpen(false);
                  return;
                }
                router.push("/konto-loeschung-angefragt");
              })
            }
          >
            {pending ? "Wird gelöscht…" : "Ja, endgültig löschen"}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the settings page**

In `apps/web/app/account/einstellungen/page.tsx`, add the import:

```ts
import { accountDeletionEnabled } from "../../_account-deletion/flag";
import { DeleteAccountCard } from "../DeleteAccountCard";
```

Add, right before the closing `</main>`, after the "Deine Daten" card:

```tsx
{
  accountDeletionEnabled() ? <DeleteAccountCard /> : null;
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
pnpm format
git add apps/web/app/account/DeleteAccountCard.tsx apps/web/app/account/einstellungen/page.tsx
git commit -m "feat(web): add the Konto-löschen card to account settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Reactivation route + status pages

**Files:**

- Create: `apps/web/app/konto-reaktivieren/[token]/route.ts`
- Create: `apps/web/app/konto-reaktivieren/page.tsx`
- Create: `apps/web/app/konto-loeschung-angefragt/page.tsx`

**Interfaces:**

- Consumes: `cancelAccountDeletion` from `@bdas/auth`; `requireAccountDeletionFlag` (Task 2).

No isolated unit test — a route handler doing one `try`/`catch` around a single already-integration-tested service call, exercised end-to-end by Task 5's e2e spec, matching `verifizieren/[token]/route.ts`'s own lack of a unit test.

- [ ] **Step 1: Write the reactivation route handler**

Create `apps/web/app/konto-reaktivieren/[token]/route.ts`:

```ts
import { NextResponse } from "next/server";

import { cancelAccountDeletion } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";

/**
 * GET /konto-reaktivieren/<token> — cancels a pending deletion.
 *
 * Deliberately does not set a session cookie, unlike /verifizieren/[token]:
 * this link is meant to be opened from whatever device has the mailbox, not
 * necessarily the device that requested the deletion, and the whole point of
 * the check is that the requesting browser might not be the account owner.
 * Handing back a live session here would undo that.
 */
export async function GET(
  request: Request,
  { params }: { params: { token: string } },
): Promise<NextResponse> {
  if (!isFlagOn("account_deletion")) return new NextResponse("Not Found", { status: 404 });

  const base = process.env["PUBLIC_SITE_URL"] ?? new URL(request.url).origin;

  try {
    await cancelAccountDeletion(getDb(), params.token);
  } catch {
    return NextResponse.redirect(new URL("/konto-reaktivieren?status=ungueltig", base));
  }

  return NextResponse.redirect(new URL("/konto-reaktivieren?status=aktiv", base));
}
```

- [ ] **Step 2: Write the reactivation status page**

Create `apps/web/app/konto-reaktivieren/page.tsx`:

```tsx
import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAccountDeletionFlag } from "../_account-deletion/flag";

export const metadata = { title: "Löschung abbrechen" };

export default function KontoReaktivierenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAccountDeletionFlag();
  const status = searchParams?.["status"];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Löschung abbrechen</h1>

      {status === "aktiv" ? (
        <Alert variant="success" title="Löschung abgebrochen">
          Dein Konto ist wieder aktiv. Melde dich an, um fortzufahren.
        </Alert>
      ) : (
        <Alert variant="error" title="Link ungültig">
          Dieser Reaktivierungslink ist ungültig oder abgelaufen.
        </Alert>
      )}

      <p className="text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Write the post-deletion confirmation page**

Create `apps/web/app/konto-loeschung-angefragt/page.tsx`:

```tsx
import Link from "next/link";

import { Alert } from "@bdas/design-system";

import { requireAccountDeletionFlag } from "../_account-deletion/flag";

export const metadata = { title: "Löschung angefragt" };

export default function KontoLoeschungAngefragtPage() {
  requireAccountDeletionFlag();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold text-bdas-ink">Löschung angefragt</h1>
      <Alert variant="info" title="Konto gesperrt">
        Deine Löschung wurde angefragt, du wurdest abgemeldet. Eine Bestätigung mit einem Link zum
        Abbrechen haben wir dir per E-Mail geschickt.
      </Alert>
      <p className="text-sm text-bdas-ink-body">
        <Link href="/anmelden" className="text-bdas-red hover:underline">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter @bdas/web typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/web/app/konto-reaktivieren apps/web/app/konto-loeschung-angefragt
git commit -m "feat(web): add the reactivation route and its status pages

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: E2E acceptance test

**Files:**

- Create: `e2e/account-deletion.e2e.ts`

**Interfaces:**

- Consumes: `login`, `logout`, `register`, `verify`, `PASSWORD` from `./helpers/flows`; `lastEmailTo`, `extractReactivationToken` (Task 1).

- [ ] **Step 1: Write the e2e spec**

Create `e2e/account-deletion.e2e.ts`:

```ts
/**
 * §23 — self-service account deletion, the slice this PR ships: request →
 * lock takes effect (login rejected) → reactivate → login works again. The
 * hard-purge sweep (PR8) is out of scope; this cannot yet test past
 * reactivation.
 */
import { expect, test } from "@playwright/test";

import {
  extractReactivationToken,
  lastEmailTo,
  login,
  logout,
  PASSWORD,
  register,
  verify,
} from "./helpers/flows";

test("requesting deletion locks the account, and the reactivation link restores it", async ({
  page,
}) => {
  const email = `del-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page);
  await login(page, email);

  await page.goto("/account/einstellungen");
  await page.getByRole("button", { name: "Konto löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ja, endgültig löschen" }).click();

  await page.waitForURL("**/konto-loeschung-angefragt");
  await expect(page.getByText("Löschung wurde angefragt")).toBeVisible();

  // The session that made the request is revoked along with every other one.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden/);

  // Logging in with the correct password is rejected with the pending-deletion message.
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText(/Löschung vorgemerkt/)).toBeVisible();

  const captured = await lastEmailTo(page, email);
  expect(captured.subject).toContain("Löschung deines Kontos angefragt");
  const token = extractReactivationToken(captured.text);

  await page.goto(`/konto-reaktivieren/${token}`);
  await expect(page).toHaveURL(/\/konto-reaktivieren\?status=aktiv/);
  await expect(page.getByText("Löschung abgebrochen")).toBeVisible();

  // A second visit to the same link is now invalid — the token was single-use.
  await page.goto(`/konto-reaktivieren/${token}`);
  await expect(page).toHaveURL(/\/konto-reaktivieren\?status=ungueltig/);

  await login(page, email);
  await expect(page).not.toHaveURL(/\/anmelden/);
  await logout(page);
});
```

- [ ] **Step 2: Run it against the real app**

Run: `pnpm db:up && pnpm db:migrate && pnpm --filter @bdas/web build && pnpm e2e account-deletion`
Expected: PASS. If a selector doesn't match (e.g. `getByRole("dialog")` — confirm the native `<dialog>` element's implicit ARIA role is picked up by Playwright, or adjust to scope via the dialog's `aria-labelledby` title text instead), fix the spec against the real rendered markup, not the other way around.

- [ ] **Step 3: Commit**

```bash
pnpm format
git add e2e/account-deletion.e2e.ts
git commit -m "test(e2e): account-deletion request/lock/reactivate flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification, `/security-review`, and archiving this plan

**Files:**

- Move: `docs/superpowers/plans/2026-09-22-account-deletion-pr3-deletion-ui.md` → `docs/archive/superpowers/plans/2026-09-22-account-deletion-pr3-deletion-ui.md`

- [ ] **Step 1: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 2: Run the full unit/integration suite**

Run: `pnpm db:up && pnpm test`
Expected: all suites pass, including Task 1 and Task 2's new tests.

- [ ] **Step 3: Run the full e2e suite**

Run: `pnpm --filter @bdas/web build && pnpm e2e`
Expected: all specs pass, including Task 5's new one — a regression here (e.g. in `password-change.e2e.ts` or `auth.e2e.ts`) would mean Task 1's notifier-wrapping or Task 3's settings-page card broke something already working.

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 5: `/security-review`**

This PR locks accounts and revokes every session for a signed-in user from a Server Action reachable by anyone with a valid session — per the design spec §10 ("`/security-review` auf jeder PR, die löscht") and the same reasoning PR1's review already covered once (no re-auth needed given the request is self-revoking and reversible by the mailbox owner, not the requester). Run it against this PR's diff before considering the branch done.

- [ ] **Step 6: Archive this plan (new CLAUDE.md rule, first applies here)**

Grep for any reference to this plan's filename before moving it:

```bash
grep -rn "2026-09-22-account-deletion-pr3-deletion-ui" docs/decisions/ modules/*/README.md 2>/dev/null
```

Expected: no matches (nothing has referenced this brand-new plan file yet). If something does match, rewrite that reference to the new path in the same commit.

Then move the file and commit as the last commit of this PR:

```bash
git mv docs/superpowers/plans/2026-09-22-account-deletion-pr3-deletion-ui.md docs/archive/superpowers/plans/2026-09-22-account-deletion-pr3-deletion-ui.md
git commit -m "docs(plans): archive the executed PR3 plan

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Spec coverage:** implements spec §4 (trigger UI + Server Action: lock, revoke, create request, send Email A) and the reactivation half of Entscheidung 4. The cron sweep (§5), data export page (§6), and module-side hard deletion (blog/files/events) are later PRs by design. ✓
- **Placeholder scan:** none — every step has full code. ✓
- **Type consistency:** `RequestAccountDeletionState` (Task 2) matches the `{ok?: true; error?: string}` shape `DeleteAccountCard` (Task 3) destructures. `accountDeletionEnabled`/`requireAccountDeletionFlag` (Task 2's flag file) are the two functions Tasks 3 and 4 import — checked both call sites use the correct one for their embedding-vs-owned-route context. `withE2ECapture`/`getCapturedEmail` (Task 1) match the `OutboundEmail` shape `notifications` already defines — no redefinition. ✓
- **Rule 6 boundary:** every new surface (`DeleteAccountCard`'s render, the reactivation route, both new pages) checks `account_deletion` independently of `auth`'s own flag, per spec §9. ✓
- **Testability decision:** the e2e email-capture gap (no plaintext token in the DB, by design) is closed with reusable, env-gated test infrastructure rather than either a security regression (cookie-ing the token) or leaving the reactivation route permanently untested end-to-end. ✓
- **New archive rule:** this plan is the first to apply it — Task 6 moves the plan to `docs/archive/superpowers/plans/` in the PR's last commit, grepping for stale references first, per CLAUDE.md's updated working agreement. ✓
- **Scope:** no module-side deletion logic, no cron, no orchestrator — matches "PR3: deletion UI" as clarified. ✓

Plan complete and saved to `docs/superpowers/plans/2026-09-22-account-deletion-pr3-deletion-ui.md`. Given the account-lock/session-revocation surface, and per your instruction: subagent-driven execution, `/security-review` at the end (Task 6).
