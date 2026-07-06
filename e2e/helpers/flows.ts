/**
 * Reusable browser flows for the §23 specs. Selectors come from the real
 * components: forms use `<Field label=… htmlFor=…>`, so `getByLabel` is stable.
 */
import { expect, type Page } from "@playwright/test";

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

export async function login(page: Page, email: string, password: string = PASSWORD): Promise<void> {
  await resetRateLimits();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL("**/account");
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

/** On /account, fill and submit the member-profile form (creates a pending member). */
export async function createProfile(
  page: Page,
  opts: { firstName?: string; lastName?: string; groupId?: string },
): Promise<void> {
  await page.goto("/account");
  await page.getByLabel("Vorname").fill(opts.firstName ?? "Test");
  await page.getByLabel("Nachname").fill(opts.lastName ?? "Nutzer");
  if (opts.groupId) {
    await page.locator("#primaryGroupId").selectOption(opts.groupId);
  }
  await page.getByRole("button", { name: "Profil einreichen" }).click();
  // Server Action revalidates /account; wait for the submit to settle.
  await expect(page.getByRole("button", { name: "Profil einreichen" })).toHaveCount(0);
}
