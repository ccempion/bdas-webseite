# Auth Email Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the auth module's Resend driver surface send failures (today they are silently discarded) and log them at every call site, without changing any user-facing auth behavior.

**Architecture:** Auth has no `notification_log` audit table (unlike notifications) and sends mail directly from three `apps/web` Server Actions via `getNotifier().send(...)`. The Resend SDK v4 resolves with `{ data, error }` and does not throw, so the driver currently discards every failure. We mirror the notifications fix (throw on `error`) and add a targeted `try/catch` + `console.error` around each `send()` call so failures become visible in server logs while the existing user-facing flows (redirect to success, privacy-preserving "always report sent") are preserved exactly.

**Tech Stack:** TypeScript, Next.js 14 App Router (Server Actions), Resend SDK v4, Vitest.

---

## Decision (resolved with the user, 2026-06-11)

When a verification/reset email fails to send, the auth flow **succeeds and logs** the failure server-side — it does not surface an error to the user. Rationale: the account/token already exists, the existing "resend verification" flow is the recovery path, and the reset/resend actions already swallow-and-continue to avoid revealing whether an email is registered. This keeps live auth behavior unchanged; the only observable difference is a server log line on failure.

## Scope

**In scope:**

- `modules/auth/src/notifier-resend.ts` — throw on Resend error result (mirror of the notifications finding-2 fix). New driver unit test.
- `apps/web/app/registrieren/actions.ts` — wrap the verify-email `send()` in try/catch + log; keep `redirect()` outside the catch.
- `apps/web/app/passwort-zuruecksetzen/actions.ts` — wrap the reset-email `send()` in an inner try/catch + log; preserve the outer `isAppError` handling and the `{ sent: true }` contract.
- `apps/web/app/verifizierung-erneut-senden/actions.ts` — add targeted logging for send failures while keeping the privacy-preserving outer `catch {}`.
- `docs/decisions/0011-defer-email-consolidation.md` — mark the "mirror into auth" follow-up as done.

**Out of scope (do NOT do):**

- HTML-escaping auth templates: auth's `render()` interpolates `verifyUrl`/`resetUrl`, which are **system-generated** (built by `buildVerifyUrl`/`buildResetUrl`), not user input — no injection surface. Do not add escaping here.
- The `core/email` consolidation itself (ADR 0011 keeps it deferred).
- Any change to `modules/auth` services (`register`, `requestPasswordReset`, etc.) or their return shapes.
- An audit table for auth mail.

**Module-boundary note:** this PR touches `modules/auth` (the driver) and `apps/web` (the three call sites that consume it). That is one logical concern (auth email reliability); the app layer is the consumer of the driver, not a second business module.

**File structure:**

- `modules/auth/src/notifier-resend.ts` — driver send method gains error handling.
- `modules/auth/src/notifier-resend.test.ts` — **new** Vitest unit test mocking `resend`.
- `apps/web/app/registrieren/actions.ts` — call-site error handling.
- `apps/web/app/passwort-zuruecksetzen/actions.ts` — call-site error handling.
- `apps/web/app/verifizierung-erneut-senden/actions.ts` — call-site logging.
- `docs/decisions/0011-defer-email-consolidation.md` — follow-up status update.

**Branch:** create `fix/auth-email-reliability` off `main` before starting.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

Run:

```bash
git checkout main && git checkout -b fix/auth-email-reliability && git branch --show-current
```

Expected: `fix/auth-email-reliability`.

---

### Task 1: Auth Resend driver throws on error result

**Files:**

- Modify: `modules/auth/src/notifier-resend.ts` (the `send` method)
- Test: `modules/auth/src/notifier-resend.test.ts` (create)

Run tests with: `pnpm --filter @bdas/auth exec vitest run <path>`.

- [ ] **Step 1: Write the failing test**

Create `modules/auth/src/notifier-resend.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createResendNotifier } from "./notifier-resend";

describe("auth createResendNotifier", () => {
  beforeEach(() => sendMock.mockReset());

  it("throws when Resend returns an error result", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(
      notifier.send({ kind: "verify", to: "x@example.org", verifyUrl: "https://e/v" }),
    ).rejects.toThrow("domain not verified");
  });

  it("resolves when Resend returns a success result", async () => {
    sendMock.mockResolvedValue({ data: { id: "re_123" }, error: null });
    const notifier = createResendNotifier({ apiKey: "re_x", from: "bdas@example.org" });
    await expect(
      notifier.send({ kind: "reset", to: "x@example.org", resetUrl: "https://e/r" }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bdas/auth exec vitest run src/notifier-resend.test.ts`
Expected: FAIL on "throws when Resend returns an error result" (the driver currently discards the result).

- [ ] **Step 3: Throw on the error result**

In `modules/auth/src/notifier-resend.ts`, the `send` method currently is:

```ts
    async send(message: AuthMessage): Promise<void> {
      const { subject, html, text } = render(message);
      await client.emails.send({
        from: opts.from,
        to: message.to,
        subject,
        html,
        text,
      });
    },
```

Replace it with:

```ts
    async send(message: AuthMessage): Promise<void> {
      const { subject, html, text } = render(message);
      const { error } = await client.emails.send({
        from: opts.from,
        to: message.to,
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message ?? JSON.stringify(error));
    },
```

(Mirrors `modules/notifications/src/notifier-resend.ts`, including the `?? JSON.stringify(error)` guard so an error result without a `message` never produces `Error: undefined`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bdas/auth exec vitest run src/notifier-resend.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Run the auth suite to confirm no regression**

Run: `pnpm --filter @bdas/auth exec vitest run`
Expected: existing `index.test.ts` / `sso.test.ts` pass or skip (DB-gated tests skip without `DATABASE_URL` — a skip is acceptable; report it).

- [ ] **Step 6: Commit**

```bash
git add modules/auth/src/notifier-resend.ts modules/auth/src/notifier-resend.test.ts
git commit -m "fix(auth): fail on Resend error result instead of discarding it

Mirrors the notifications finding-2 fix (ADR 0011 follow-up). Resend v4
resolves with {data,error}; the auth driver discarded it, so verification and
password-reset email failures were invisible. Driver now throws on error; call
sites log and continue (next commit).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Log send failures at the three call sites (no behavior change)

**Files:**

- Modify: `apps/web/app/registrieren/actions.ts:52`
- Modify: `apps/web/app/passwort-zuruecksetzen/actions.ts:41`
- Modify: `apps/web/app/verifizierung-erneut-senden/actions.ts:29`

There is no test harness in `apps/web`; verify with typecheck + build. The driver can now throw, so each `send()` call must catch it. Behavior the user sees must not change.

- [ ] **Step 1: registrieren/actions.ts — wrap send, keep redirect outside**

The current tail of `registerAction` (lines 48-54) is:

```ts
const verifyUrl = buildVerifyUrl(
  process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
  result.verifyToken,
);
await getNotifier().send({ kind: "verify", to: email, verifyUrl });

redirect("/registrieren/erfolg");
```

Replace with:

```ts
const verifyUrl = buildVerifyUrl(
  process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
  result.verifyToken,
);
try {
  await getNotifier().send({ kind: "verify", to: email, verifyUrl });
} catch (err) {
  // Account is already created; the resend-verification flow is the recovery
  // path. Don't fail the response — surface the failure in logs instead.
  console.error("[auth] verify email send failed:", err);
}

redirect("/registrieren/erfolg");
```

`redirect()` must stay OUTSIDE the try/catch — it signals via a thrown `NEXT_REDIRECT` that must propagate.

- [ ] **Step 2: passwort-zuruecksetzen/actions.ts — inner catch around the reset send**

The current `requestResetAction` body (lines 34-49) is:

```ts
try {
  const result = await requestPasswordReset(getDb(), { email }, { ip });
  if (result) {
    const url = buildResetUrl(
      process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      result.resetToken,
    );
    await getNotifier().send({ kind: "reset", to: email, resetUrl: url });
  }
} catch (err) {
  if (isAppError(err)) return { error: err.message };
  throw err;
}

// Always report "sent" — never reveal whether the email is registered.
return { sent: true };
```

Replace the inner `await getNotifier().send(...)` line with its own try/catch so a send failure is logged but never breaks the `{ sent: true }` privacy contract (and is not mistaken for an app error by the outer catch):

```ts
try {
  const result = await requestPasswordReset(getDb(), { email }, { ip });
  if (result) {
    const url = buildResetUrl(
      process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      result.resetToken,
    );
    try {
      await getNotifier().send({ kind: "reset", to: email, resetUrl: url });
    } catch (err) {
      console.error("[auth] reset email send failed:", err);
    }
  }
} catch (err) {
  if (isAppError(err)) return { error: err.message };
  throw err;
}

// Always report "sent" — never reveal whether the email is registered.
return { sent: true };
```

- [ ] **Step 3: verifizierung-erneut-senden/actions.ts — log send failures, keep privacy swallow**

The current `resendAction` body (lines 22-35) is:

```ts
try {
  const result = await resendVerification(getDb(), email);
  if (result) {
    const verifyUrl = buildVerifyUrl(
      process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      result.verifyToken,
    );
    await getNotifier().send({ kind: "verify", to: email, verifyUrl });
  }
} catch {
  // Always return "sent" — do not reveal whether the email exists.
}

return { sent: true };
```

Wrap only the send in an inner try/catch that logs, leaving the outer privacy-preserving `catch {}` intact (so `resendVerification` failures stay silent, but send failures are logged):

```ts
try {
  const result = await resendVerification(getDb(), email);
  if (result) {
    const verifyUrl = buildVerifyUrl(
      process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000",
      result.verifyToken,
    );
    try {
      await getNotifier().send({ kind: "verify", to: email, verifyUrl });
    } catch (err) {
      console.error("[auth] resend verification email send failed:", err);
    }
  }
} catch {
  // Always return "sent" — do not reveal whether the email exists.
}

return { sent: true };
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @bdas/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Build**

Run: `pnpm --filter @bdas/web build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/registrieren/actions.ts apps/web/app/passwort-zuruecksetzen/actions.ts apps/web/app/verifizierung-erneut-senden/actions.ts
git commit -m "fix(web): log auth email send failures without changing user-facing flow

The auth Resend driver can now throw. Each send() call site catches and logs
the failure: registration still redirects to success, reset/resend still
report 'sent' (privacy-preserving). Net effect: failures are now visible in
server logs instead of being silently discarded; no behavior change for users.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Mark the ADR 0011 follow-up done

**Files:**

- Modify: `docs/decisions/0011-defer-email-consolidation.md`

- [ ] **Step 1: Update the consequence note**

In `docs/decisions/0011-defer-email-consolidation.md`, find the consequence bullet:

```
- The error-handling fix from the 2026-06 review lives in
  `modules/notifications` now and must be mirrored into `modules/auth`
  separately (tracked as a follow-up).
```

Replace it with:

```
- The error-handling fix from the 2026-06 review was applied to
  `modules/notifications` first and has now been mirrored into `modules/auth`
  (the driver throws on Resend errors; the auth Server Actions log and
  continue). The two drivers remain separate pending consolidation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/0011-defer-email-consolidation.md
git commit -m "docs(adr-0011): mark auth Resend error-handling mirror as done

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final verification

- [ ] **Step 1: Auth driver tests**

Run: `pnpm --filter @bdas/auth exec vitest run src/notifier-resend.test.ts`
Expected: 2 pass.

- [ ] **Step 2: App typecheck + build**

Run: `pnpm --filter @bdas/web exec tsc --noEmit && pnpm --filter @bdas/web build`
Expected: clean + success.

- [ ] **Step 3: Confirm scope**

Run: `git diff --name-only main`
Expected exactly: `modules/auth/src/notifier-resend.ts`, `modules/auth/src/notifier-resend.test.ts`, `apps/web/app/registrieren/actions.ts`, `apps/web/app/passwort-zuruecksetzen/actions.ts`, `apps/web/app/verifizierung-erneut-senden/actions.ts`, `docs/decisions/0011-defer-email-consolidation.md`. No `modules/auth` service files, no `modules/notifications` files.

---

## Self-Review

- **Spec coverage:** driver throw (Task 1) + the three consuming call sites — register (Task 2 Step 1), reset (Step 2), resend (Step 3) — + ADR update (Task 3) + verification (Task 4). All three `getNotifier().send` sites in the codebase are covered.
- **Placeholder scan:** every step shows the exact before/after code; no TBD/"handle errors" placeholders.
- **Behavior-change check:** registration still redirects to `/registrieren/erfolg`; reset still returns `{ sent: true }`; resend still returns `{ sent: true }`. The only new behavior is `console.error` on send failure. `redirect()` is kept outside the try/catch so `NEXT_REDIRECT` still propagates. Matches the user's "succeed + log" decision.
- **Type consistency:** `createResendNotifier(opts: ResendNotifierOptions): Notifier`; `send(message: AuthMessage): Promise<void>` unchanged; the `AuthMessage` shapes used in tests (`{kind:"verify",to,verifyUrl}` / `{kind:"reset",to,resetUrl}`) match `modules/auth/src/notifier.ts`.
- **Security note:** `auth` templates interpolate system-generated URLs only — no user-controlled HTML — so the notifications HTML-escaping fix is intentionally not mirrored here.

```

```
