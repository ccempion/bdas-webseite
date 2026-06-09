/**
 * §23 — "a new visitor can register, verify email, log in, log out, reset password."
 * Drives the real UI; the one-time tokens are read from the DB (the app would
 * normally email them).
 */
import { expect, test } from "@playwright/test";

import { latestResetToken, resetRateLimits, uniqueEmail } from "./helpers/db";
import { login, logout, PASSWORD, register, verify } from "./helpers/flows";

test("register → verify → login → logout → reset → re-login", async ({ page }) => {
  const email = uniqueEmail("auth");

  await register(page, { email });
  await verify(page, email);

  await login(page, email);
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();

  // The global header (role=banner) must reflect the session, and must survive a
  // reload of a public page — the reported "logged out on reload" symptom.
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Mein Konto" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page.goto("/");
  await page.reload();
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Anmelden" })).toHaveCount(0);

  await logout(page);
  await expect(page).not.toHaveURL(/\/account/);
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
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});
