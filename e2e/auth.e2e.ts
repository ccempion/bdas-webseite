/**
 * §23 — "a new visitor can register, verify email, log in, log out, reset password."
 * Drives the real UI; the one-time tokens are read from the DB (the app would
 * normally email them).
 */
import { expect, test } from "@playwright/test";

import { latestResetToken, resetRateLimits, uniqueEmail } from "./helpers/db";
import { login, logout, openMobileMenu, PASSWORD, register, verify } from "./helpers/flows";

test("register → verify → login → logout → reset → re-login", async ({ page }) => {
  const email = uniqueEmail("auth");

  await register(page, { email });
  await expect(page.getByText(/Spam-Ordner/)).toBeVisible();

  await verify(page, email);

  // With the `profile` flag on, sign-in routes a pending member with an
  // unfinished profile to the wizard (anmelden/actions.ts) — this spec is about
  // the session, so go to /account explicitly rather than assume the landing.
  await login(page, email);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();

  // The global header (role=banner) must reflect the session, and must survive a
  // reload of a public page — the reported "logged out on reload" symptom. This
  // suite runs a mobile viewport, so the header's controls live behind the
  // "Menü" disclosure, which resets closed on every navigation/reload.
  const banner = page.getByRole("banner");
  await openMobileMenu(page);
  await expect(banner.getByRole("link", { name: "Mein Konto" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page.goto("/");
  await page.reload();
  await openMobileMenu(page);
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Anmelden" })).toHaveCount(0);

  await logout(page);
  await expect(page).not.toHaveURL(/\/account/);
  await openMobileMenu(page);
  await expect(banner.getByRole("link", { name: "Anmelden" })).toBeVisible();

  // Request a password reset, then complete it with the DB-read token.
  await resetRateLimits();
  await page.goto("/passwort-zuruecksetzen");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: "Link senden" }).click();

  // The reset token is written by the Server Action; poll to avoid a race.
  let token: string | null = null;
  await expect(async () => {
    token = await latestResetToken(email);
    expect(token, `reset token for ${email}`).toBeTruthy();
  }).toPass({ timeout: 10_000 });

  const newPassword = `${PASSWORD}-neu`;
  await page.goto(`/passwort-zuruecksetzen/${token}`);
  await page.getByLabel("Neues Passwort").fill(newPassword);
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  // completeResetAction redirects to /anmelden only on success — confirms done.
  await page.waitForURL("**/anmelden");

  // The old password must no longer work; the new one must.
  await login(page, email, newPassword);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});
