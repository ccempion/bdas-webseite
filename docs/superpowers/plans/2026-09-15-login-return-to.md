# Login Return-To Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a not-logged-in visitor is bounced to `/anmelden` from a protected page, logging in lands them back on the page they originally asked for, instead of always on the public home page.

**Architecture:** A `returnTo` query parameter carries the originally requested internal path from the guard to `/anmelden`, through the login form as a hidden field, into the login Server Action, which redirects there on success. A single sanitizer (`sanitizeReturnTo`) is the only thing allowed to decide a value is safe to redirect to — it is called both when `/anmelden` renders (to reflect the param into the form) and again inside the login Server Action (which sees raw `FormData` an attacker could post directly, so it must never trust what the page already reflected). Only a same-origin, single-leading-slash path is ever accepted; anything scheme-qualified, protocol-relative, or carrying a backslash/control character is rejected and falls back to `/`. No guard logic is bypassed by this: `returnTo` only ever steers a browser navigation to a URL, and that URL's own page/layout runs its normal `if (!me) redirect(...)` / role checks the moment it renders — there is no separate "trusted because it came from returnTo" code path.

**Scope note (from prior research turn):** This plan covers only the pages with a *direct* `if (!me) redirect("/anmelden")` guard — `/account`, `/account/einstellungen`, `/admin/events` (+ `neu`, `/[id]`, `/[id]/edit`), `/blog/meldungen`, `/faq`, `/profil`. The `(board)/*` routes (gated centrally through `requireBoardAccess()` in `apps/web/app/_dashboard/session.ts`) are explicitly **out of scope**: Next.js 14 Server Component layouts have no built-in access to the requested pathname, and getting it there needs either new `middleware.ts` (edge runtime, doesn't have the Postgres access the real session check needs) or pathname prop-drilling through every nested board layout — both bigger and riskier than this fix. That gap was raised with ccempion and accepted as a known follow-up, not silently dropped.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), TypeScript, Vitest, Playwright.

**Spec:** No spec/ADR entry exists for this yet (it's a bug-fix-sized UX gap, not a new module or product decision). This plan is scoped directly from the reported behavior (issue #54) and the codebase as found.

## Global Constraints

- One module per PR (CLAUDE.md §4) — this is a single, self-contained change; do not fold in unrelated cleanup.
- No inline hex/radius/shadow — N/A, this plan touches no visual styling.
- No mocks of the database — the one integration test (Task 5) drives the real app against Docker Postgres via Playwright, per existing `e2e/auth.e2e.ts` convention.
- Run `npx prettier --write <touched files>` before every commit (CI's format check fails on unformatted output — do this every time, not just at the end).
- Follow the existing app-level convention: helpers that are Next.js-routing glue (not a business/domain concern) live under `apps/web/app/_auth/`, not `core/` — matches the existing `apps/web/app/_auth/flag.ts`.

---

## Task 1: `sanitizeReturnTo` / `buildAnmeldenUrl` helper

**Files:**
- Create: `apps/web/app/_auth/return-to.ts`
- Test: `apps/web/app/_auth/return-to.test.ts`

**Interfaces:**
- Produces: `sanitizeReturnTo(raw: string | string[] | undefined): string | null` — the open-redirect guard, used by every later task.
- Produces: `buildAnmeldenUrl(path: string): string` — used by every guard call site to build `/anmelden?returnTo=<encoded path>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/_auth/return-to.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildAnmeldenUrl, sanitizeReturnTo } from "./return-to";

describe("sanitizeReturnTo", () => {
  it("accepts a plain internal path", () => {
    expect(sanitizeReturnTo("/account")).toBe("/account");
  });

  it("accepts a nested path with a dynamic segment", () => {
    expect(sanitizeReturnTo("/admin/events/123/edit")).toBe("/admin/events/123/edit");
  });

  it("accepts a path carrying its own query string", () => {
    expect(sanitizeReturnTo("/gruppe/muenchen/overview?tab=mitglieder")).toBe(
      "/gruppe/muenchen/overview?tab=mitglieder",
    );
  });

  it("accepts the root path", () => {
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("rejects a missing value", () => {
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(sanitizeReturnTo("")).toBeNull();
  });

  it("rejects an array value (repeated query param)", () => {
    expect(sanitizeReturnTo(["/account", "/admin"])).toBeNull();
  });

  it("rejects a value with no leading slash", () => {
    expect(sanitizeReturnTo("account")).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
  });

  it("rejects a scheme-qualified URL", () => {
    expect(sanitizeReturnTo("https://evil.example")).toBeNull();
    expect(sanitizeReturnTo("https://evil.example/account")).toBeNull();
  });

  it("rejects a javascript: pseudo-scheme", () => {
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("rejects a backslash-obfuscated protocol-relative URL", () => {
    expect(sanitizeReturnTo("/\\evil.example")).toBeNull();
  });

  it("rejects a value carrying a header-injection attempt", () => {
    expect(sanitizeReturnTo("/foo\r\nSet-Cookie: x=1")).toBeNull();
  });
});

describe("buildAnmeldenUrl", () => {
  it("encodes the path into a returnTo query parameter", () => {
    expect(buildAnmeldenUrl("/admin/events")).toBe("/anmelden?returnTo=%2Fadmin%2Fevents");
  });

  it("encodes special characters in the path", () => {
    expect(buildAnmeldenUrl("/gruppe/münchen/overview")).toBe(
      "/anmelden?returnTo=%2Fgruppe%2Fm%C3%BCnchen%2Foverview",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run app/_auth/return-to.test.ts`
Expected: FAIL — `return-to.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `apps/web/app/_auth/return-to.ts`:

```ts
/**
 * Support for "return to the originally requested page after login."
 *
 * `sanitizeReturnTo` is the open-redirect guard: only a same-origin path may
 * ever be honored, never a scheme-qualified or protocol-relative URL. Both
 * `/anmelden` (reflecting `?returnTo=` into the login form) and the login
 * Server Action (which sees raw form data an attacker could post directly)
 * call it independently — neither trusts the other's validation.
 */
const SAFE_INTERNAL_PATH = /^\/(?!\/)[^\s"'<>\\]*$/;

export function sanitizeReturnTo(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && SAFE_INTERNAL_PATH.test(raw) ? raw : null;
}

/** Build the `/anmelden` URL that carries a guard's own path as `returnTo`. */
export function buildAnmeldenUrl(path: string): string {
  return `/anmelden?returnTo=${encodeURIComponent(path)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run app/_auth/return-to.test.ts`
Expected: PASS, all 14 assertions green.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write apps/web/app/_auth/return-to.ts apps/web/app/_auth/return-to.test.ts
git add apps/web/app/_auth/return-to.ts apps/web/app/_auth/return-to.test.ts
git commit -m "feat(auth): add sanitizeReturnTo/buildAnmeldenUrl helpers"
```

---

## Task 2: Wire `/anmelden` to preserve and consume `returnTo`

**Files:**
- Modify: `apps/web/app/anmelden/page.tsx`
- Modify: `apps/web/app/anmelden/AnmeldenForm.tsx`
- Modify: `apps/web/app/anmelden/actions.ts`

**Interfaces:**
- Consumes: `sanitizeReturnTo` and `buildAnmeldenUrl` from Task 1 (`apps/web/app/_auth/return-to.ts`).
- Produces: `AnmeldenForm` now takes a `returnTo?: string | null` prop and renders it as a hidden `<input name="returnTo">` when present — Tasks 3/4 don't touch this file, but rely on `/anmelden?returnTo=...` (built by `buildAnmeldenUrl`) actually being honored end-to-end by this task.

- [ ] **Step 1: Update `anmelden/page.tsx` to sanitize the incoming param and use it for the already-logged-in redirect**

Modify `apps/web/app/anmelden/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { Card } from "@bdas/design-system";

import { requireAuthFlag } from "../_auth/flag";
import { sanitizeReturnTo } from "../_auth/return-to";
import { loadViewer } from "../_dashboard/session";
import { AnmeldenForm } from "./AnmeldenForm";

export const metadata = { title: "Anmelden" };

export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  requireAuthFlag();
  const returnTo = sanitizeReturnTo(searchParams?.["returnTo"]);
  if (await loadViewer()) redirect(returnTo ?? "/");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-bdas-ink">Anmelden</h1>
        <p className="text-bdas-ink-body">Mit deiner E-Mail-Adresse einloggen.</p>
      </header>

      <Card flat className="p-6">
        <AnmeldenForm returnTo={returnTo} />
      </Card>

      <p className="text-center text-sm text-bdas-ink-body">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="text-bdas-red hover:underline">
          Registrieren
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Update `AnmeldenForm.tsx` to accept and forward `returnTo`**

Modify `apps/web/app/anmelden/AnmeldenForm.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";

import { Alert, Button, Field, Form, Input, PasswordInput } from "@bdas/design-system";

import { loginAction, type LoginFormState } from "./actions";

const initial: LoginFormState = {};

export function AnmeldenForm({ returnTo }: { returnTo?: string | null }) {
  const [state, action] = useFormState(loginAction, initial);
  return (
    <Form action={action}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.needsVerification ? (
        <p className="text-sm text-bdas-ink-body">
          <Link href="/verifizierung-erneut-senden" className="text-bdas-red hover:underline">
            Bestätigungsmail erneut senden
          </Link>
        </p>
      ) : null}
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/passwort-zuruecksetzen" className="text-sm text-bdas-red hover:underline">
          Passwort vergessen?
        </Link>
        <SubmitButton />
      </div>
    </Form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Anmelden…" : "Anmelden"}
    </Button>
  );
}
```

- [ ] **Step 3: Update `actions.ts` to re-sanitize `returnTo` from form data and redirect there on success**

Modify `apps/web/app/anmelden/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { login } from "@bdas/auth";
import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn, requireFlag } from "@bdas/feature-flags";
import { getMemberByUserId } from "@bdas/members";

import { bootAuth } from "../../lib/auth-bootstrap";
import { setSessionCookie } from "../../lib/auth-cookie";
import { sanitizeReturnTo } from "../_auth/return-to";
import { isProfileComplete } from "../_profile/complete";

export type LoginFormState = {
  readonly error?: string;
  readonly needsVerification?: boolean;
};

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  requireFlag("auth");
  bootAuth();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const returnTo = sanitizeReturnTo(formData.get("returnTo")?.toString());
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "0.0.0.0";
  const userAgent = h.get("user-agent") ?? undefined;

  let result;
  try {
    result = await login(
      getDb(),
      { email, password },
      { ip, ...(userAgent !== undefined ? { userAgent } : {}) },
    );
  } catch (err) {
    if (isAppError(err)) {
      const needsVerification = err.message.includes("E-Mail-Adresse");
      return { error: err.message, ...(needsVerification ? { needsVerification: true } : {}) };
    }
    throw err;
  }

  setSessionCookie(result.token);

  // Guide pending members who verified but never finished onboarding straight
  // into the wizard, even if they were bounced from a different page before
  // login — onboarding isn't skippable via returnTo. Everyone else lands on
  // the page they originally asked for, or the public home page.
  if (isFlagOn("profile")) {
    const db = getDb();
    const member = await getMemberByUserId(db, result.userId);
    if (member?.status === "pending" && !(await isProfileComplete(db, result.userId))) {
      redirect("/profil");
    }
  }
  redirect(returnTo ?? "/");
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS, no type errors (note `formData.get("returnTo")` is `FormDataEntryValue | null`; `?.toString()` yields `string | undefined`, which `sanitizeReturnTo` already accepts).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write apps/web/app/anmelden/page.tsx apps/web/app/anmelden/AnmeldenForm.tsx apps/web/app/anmelden/actions.ts
git add apps/web/app/anmelden/page.tsx apps/web/app/anmelden/AnmeldenForm.tsx apps/web/app/anmelden/actions.ts
git commit -m "feat(auth): preserve returnTo through the login form and action"
```

---

## Task 3: Point the static-path guards at `buildAnmeldenUrl`

**Files:**
- Modify: `apps/web/app/account/page.tsx:47`
- Modify: `apps/web/app/account/einstellungen/page.tsx:25`
- Modify: `apps/web/app/profil/page.tsx:21`
- Modify: `apps/web/app/faq/page.tsx:60`
- Modify: `apps/web/app/blog/meldungen/page.tsx:20`
- Modify: `apps/web/app/admin/events/page.tsx:27`
- Modify: `apps/web/app/admin/events/neu/page.tsx:20`

**Interfaces:**
- Consumes: `buildAnmeldenUrl(path: string): string` from Task 1.

Each of these seven files has the identical one-line change: add the import, then replace the bare `redirect("/anmelden")` with `redirect(buildAnmeldenUrl("<this route's own literal path>"))`. None of these routes need to preserve a query string (verified: none of their guarded views depend on search params for the returnTo target itself).

- [ ] **Step 1: `apps/web/app/account/page.tsx`**

Add to the import block (alongside the existing `requireAuthFlag` import):

```ts
import { buildAnmeldenUrl } from "../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/account"));
```

- [ ] **Step 2: `apps/web/app/account/einstellungen/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/account/einstellungen"));
```

- [ ] **Step 3: `apps/web/app/profil/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/profil"));
```

- [ ] **Step 4: `apps/web/app/faq/page.tsx`**

Add import (alongside the other `_dashboard`/lib imports near the top):

```ts
import { buildAnmeldenUrl } from "../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/faq"));
```

- [ ] **Step 5: `apps/web/app/blog/meldungen/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/blog/meldungen"));
```

- [ ] **Step 6: `apps/web/app/admin/events/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/admin/events"));
```

- [ ] **Step 7: `apps/web/app/admin/events/neu/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl("/admin/events/neu"));
```

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS, no type or import errors across all seven files.

- [ ] **Step 9: Lint**

Run: `pnpm --filter web lint`
Expected: PASS — confirms none of the new imports trip the ESLint module-boundary rules (they shouldn't: `_auth/return-to` is a sibling app path, not a cross-module deep import).

- [ ] **Step 10: Format and commit**

```bash
npx prettier --write apps/web/app/account/page.tsx apps/web/app/account/einstellungen/page.tsx apps/web/app/profil/page.tsx apps/web/app/faq/page.tsx apps/web/app/blog/meldungen/page.tsx apps/web/app/admin/events/page.tsx apps/web/app/admin/events/neu/page.tsx
git add apps/web/app/account/page.tsx apps/web/app/account/einstellungen/page.tsx apps/web/app/profil/page.tsx apps/web/app/faq/page.tsx apps/web/app/blog/meldungen/page.tsx apps/web/app/admin/events/page.tsx apps/web/app/admin/events/neu/page.tsx
git commit -m "feat(auth): carry returnTo from the static-path login guards"
```

---

## Task 4: Point the dynamic-path guards (`admin/events/[id]*`) at `buildAnmeldenUrl`

**Files:**
- Modify: `apps/web/app/admin/events/[id]/page.tsx:38`
- Modify: `apps/web/app/admin/events/[id]/edit/page.tsx:27`

**Interfaces:**
- Consumes: `buildAnmeldenUrl(path: string): string` from Task 1.

These two need the route's `params.id` folded into the path (Next.js dynamic segments never contain `/`, so no extra sanitization is needed here — `buildAnmeldenUrl` only URL-encodes).

- [ ] **Step 1: `apps/web/app/admin/events/[id]/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl(`/admin/events/${params.id}`));
```

- [ ] **Step 2: `apps/web/app/admin/events/[id]/edit/page.tsx`**

Add import:

```ts
import { buildAnmeldenUrl } from "../../../../_auth/return-to";
```

Change:

```ts
  if (!me) redirect("/anmelden");
```

to:

```ts
  if (!me) redirect(buildAnmeldenUrl(`/admin/events/${params.id}/edit`));
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write "apps/web/app/admin/events/[id]/page.tsx" "apps/web/app/admin/events/[id]/edit/page.tsx"
git add "apps/web/app/admin/events/[id]/page.tsx" "apps/web/app/admin/events/[id]/edit/page.tsx"
git commit -m "feat(auth): carry returnTo from the admin/events/[id] guards"
```

---

## Task 5: End-to-end coverage of the full return-to story

**Files:**
- Modify: `e2e/auth.e2e.ts`

**Interfaces:**
- Consumes: `PASSWORD`, `pickCombo`, `registerVerifyLogin`, `createProfile`, `submitAndSettle`, `uniqueEmail` from `e2e/helpers/flows.ts` / `e2e/helpers/db.ts` (all already exported, see `e2e/account-profile.e2e.ts` for the identical "complete the extended profile" recipe this task reuses).

The login action's pending-member-onboarding redirect to `/profil` takes priority over `returnTo` (Task 2, Step 3 — intentional: onboarding isn't skippable). So this test must use a member whose profile is already complete, or the login would always land on `/profil` regardless of `returnTo`, and the test would pass for the wrong reason. `e2e/account-profile.e2e.ts` already has this exact recipe (register → verify → login → `createProfile` → fill the extended profile form) — this task repeats it locally rather than importing across spec files (each `*.e2e.ts` file in this repo keeps its setup helpers local; see `completeProfile` in `account-profile.e2e.ts`).

- [ ] **Step 1: Write the test**

Add to `e2e/auth.e2e.ts` (new imports at the top, new test at the end of the file):

```ts
import { seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import {
  createProfile,
  login,
  logout,
  openMobileMenu,
  pickCombo,
  PASSWORD,
  register,
  registerVerifyLogin,
  submitAndSettle,
  verify,
} from "./helpers/flows";
```

(merge these into the existing `import { latestResetToken, resetRateLimits, uniqueEmail } from "./helpers/db";` and `import { login, logout, openMobileMenu, PASSWORD, register, registerVerifyLogin, verify } from "./helpers/flows";` lines already at the top of the file — add `seedGroup`, `uniqueSlug` to the `db` import and `createProfile`, `pickCombo`, `submitAndSettle` to the `flows` import.)

Append this test at the end of the file, after the "a member reaches account settings" test:

```ts
/**
 * Issue #54: a not-logged-in visit to a protected page must not lose the
 * destination — login should land back on it, not always on the home page.
 * Uses /account/einstellungen as the protected target; the profile must be
 * complete first, since an incomplete pending profile forces a `/profil`
 * landing regardless of `returnTo` (loginAction's onboarding branch — see
 * apps/web/app/anmelden/actions.ts).
 */
test("logging in from a protected-page redirect lands back on that page", async ({ page }) => {
  const email = uniqueEmail("returnto");
  const groupId = await seedGroup({
    slug: uniqueSlug("returnto"),
    name: "Returnto Test Gruppe",
    city: "Teststadt",
  });

  await registerVerifyLogin(page, { email, firstName: "Return", lastName: "To" });
  await createProfile(page, { firstName: "Return", lastName: "To", groupId });

  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill("Informatik");
  await form.locator("#konto-abschlussart").selectOption("bachelor");
  await pickCombo(form, "konto-uni", "RWTH Aachen");
  await form.locator("#konto-geburtsdatum").fill("2000-03-04");
  await form.locator("#konto-gefundenDurch").selectOption("webseite");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));

  await logout(page);

  // Visiting the protected page while logged out must bounce through
  // /anmelden carrying the originally requested path.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden\?returnTo=%2Faccount%2Feinstellungen/);

  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // Lands back on /account/einstellungen, not on the home page.
  await page.waitForURL("**/account/einstellungen");
  await expect(page.getByRole("heading", { name: "Kontoeinstellungen" })).toBeVisible();
});

/**
 * The open-redirect guard: a crafted returnTo pointing off-site must never be
 * honored. sanitizeReturnTo's unit tests (apps/web/app/_auth/return-to.test.ts)
 * cover the sanitizer exhaustively; this pins the integration once — login
 * with a scheme-qualified returnTo still lands on the safe default.
 */
test("a scheme-qualified returnTo is ignored, not followed", async ({ page }) => {
  const email = uniqueEmail("openredirect");
  await registerVerifyLogin(page, { email, firstName: "Open", lastName: "Redirect" });
  await logout(page);

  await page.goto("/anmelden?returnTo=" + encodeURIComponent("https://evil.example"));
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // The malicious returnTo is stripped server-side before the redirect is
  // issued, so this never becomes a real cross-origin navigation — it lands
  // on the safe default (home page), not evil.example.
  await page.waitForURL((url) => url.pathname === "/");
  expect(new URL(page.url()).hostname).not.toBe("evil.example");
});
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm e2e e2e/auth.e2e.ts`
Expected: PASS — all tests in the file green, including the two new ones. (Requires `BDAS_FLAG_AUTH=true` and `BDAS_FLAG_PROFILE=true` in the served app, same as the rest of this file; confirm via `apps/web/.env.local` per the existing project convention if a flag-off failure shows up.)

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write e2e/auth.e2e.ts
git add e2e/auth.e2e.ts
git commit -m "test(e2e): cover the login returnTo happy path and open-redirect guard"
```

---

## Final check

- [ ] Run the full unit suite: `pnpm test` — expect PASS.
- [ ] Run the full typecheck: `pnpm typecheck` — expect PASS.
- [ ] Run lint: `pnpm lint` — expect PASS.
- [ ] Run the full e2e suite (or at least `auth.e2e.ts`, `account-profile.e2e.ts`, `board.e2e.ts` to confirm nothing in the board module broke, since it's untouched but shares `_dashboard/session.ts`): `pnpm e2e` — expect PASS.
- [ ] Confirm the `(board)/*` gap is communicated back to ccempion as a known, deliberate follow-up (not silently missing) — this was already flagged in the research turn; restate it when handing off the PR.
