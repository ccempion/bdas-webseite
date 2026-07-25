/**
 * Reusable browser flows for the §23 specs. Selectors come from the real
 * components: forms use `<Field label=… htmlFor=…>`, so `getByLabel` is stable.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { latestVerifyToken, resetRateLimits } from "./db";

/** A password that satisfies the registration policy comfortably. */
export const PASSWORD = "Korrekt-Pferd-Batterie-9!";

export async function register(
  page: Page,
  opts: { email: string; firstName?: string; lastName?: string; password?: string },
): Promise<void> {
  await resetRateLimits();
  await page.goto("/registrieren");
  await page.getByLabel("Vorname").fill(opts.firstName ?? "Test");
  await page.getByLabel("Nachname").fill(opts.lastName ?? "Nutzer");
  await page.getByLabel("E-Mail").fill(opts.email);
  await page.getByLabel("Passwort").fill(opts.password ?? PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await page.waitForURL("**/registrieren/erfolg");
}

/** Read the emailed verification token from the DB and visit the verify URL. */
export async function verify(page: Page, email: string): Promise<void> {
  let token: string | null = null;
  // The token is written by the register Server Action; poll to avoid a race.
  await expect(async () => {
    token = await latestVerifyToken(email);
    expect(token, `verify token for ${email}`).toBeTruthy();
  }).toPass({ timeout: 10_000 });
  await page.goto(`/verifizieren/${token}`);
}

/**
 * Sign in. With the `profile` flag on, a pending member whose extended profile
 * is unfinished is routed to the onboarding wizard instead of `/account`
 * (anmelden/actions.ts) — accept either landing page. Pass `expect: "profil"`
 * to require the wizard.
 */
export async function login(
  page: Page,
  email: string,
  password: string = PASSWORD,
  opts: { expect?: "account" | "profil" | "either" } = {},
): Promise<void> {
  await resetRateLimits();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  const want = opts.expect ?? "either";
  await page.waitForURL((url) =>
    want === "either"
      ? url.pathname.startsWith("/account") || url.pathname.startsWith("/profil")
      : url.pathname.startsWith(`/${want}`),
  );
}

/** Force-open the mobile "Menü" disclosure (PublicHeader, public_shell flag)
 *  so its links/buttons (Mein Konto, Abmelden, Anmelden, …) become actionable
 *  on this suite's mobile viewport. Sets `.open` directly rather than
 *  clicking the summary, so it's idempotent (no toggle-closed risk if the
 *  menu is already open). No-op against the legacy SiteHeader, which has no
 *  such disclosure. */
export async function openMobileMenu(page: Page): Promise<void> {
  const menu = page.locator('header details:has(summary[aria-label="Menü öffnen"])');
  if (await menu.count()) {
    await menu.evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
  }
}

export async function logout(page: Page): Promise<void> {
  // The header (role=banner) carries the global logout; scope to it so we don't
  // collide with page-level "Abmelden" buttons (/account, event cancel).
  await openMobileMenu(page);
  await page.getByRole("banner").getByRole("button", { name: "Abmelden" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/account"));
}

/** Register → verify → login in one go. Returns nothing; leaves session on /account. */
export async function registerVerifyLogin(
  page: Page,
  opts: { email: string; firstName?: string; lastName?: string; password?: string },
): Promise<void> {
  await register(page, opts);
  await verify(page, opts.email);
  await login(page, opts.email, opts.password ?? PASSWORD);
}

/**
 * On /account, fill and submit the member-profile form (name + group).
 *
 * Registration itself now creates the member row (the name-drop fix), so the
 * submit reads "Speichern"; "Profil einreichen" only appears for a member row
 * that doesn't exist yet. With the `profile` flag on, /account also renders the
 * extended-profile form — which has a "Speichern" of its own — so everything is
 * scoped to the members form (the one owning `#firstName`).
 */
export async function createProfile(
  page: Page,
  opts: { firstName?: string; lastName?: string; groupId?: string },
): Promise<void> {
  await page.goto("/account");
  const form = page.locator("form:has(#firstName)");
  await form.getByLabel("Vorname").fill(opts.firstName ?? "Test");
  await form.getByLabel("Nachname").fill(opts.lastName ?? "Nutzer");
  if (opts.groupId) {
    await form.locator("#primaryGroupId").selectOption(opts.groupId);
  }
  await submitAndSettle(page, form.getByRole("button", { name: /Profil einreichen|Speichern/ }));
}

/**
 * Click a Server-Action submit and wait for the action's POST to come back —
 * the response carries the re-rendered tree, so the write has committed by the
 * time it resolves. Deterministic where "wait for the button label to change"
 * is not.
 */
export async function submitAndSettle(page: Page, submit: Locator): Promise<void> {
  const path = new URL(page.url()).pathname;
  const settled = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === path,
  );
  await submit.click();
  await settled;
}
