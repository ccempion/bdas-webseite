/**
 * §23 — a signed-in member can change their password without their inbox.
 * Split out of auth.e2e.ts, which is already one long linear flow.
 */
import { expect, test } from "@playwright/test";

import { login, openMobileMenu, PASSWORD, register, verify } from "./helpers/flows";

const NEW_PASSWORD = "Ganz-Anderes-Pferd-7!";

test("change the password from /account, then sign in with the new one", async ({ page }) => {
  const email = `pw-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page, email);
  await login(page, email);

  await page.goto("/account");
  // getByRole("group", …) doesn't match this <details> markup; target the summary directly.
  await page.locator("details:has(summary:text('Passwort ändern')) summary").click();

  await page.getByLabel("Aktuelles Passwort", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Neues Passwort", { exact: true }).fill(NEW_PASSWORD);

  // Mismatched repeat blocks submission, matching repeat unblocks it.
  await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill("Etwas-Anderes-1!");
  await expect(page.getByRole("button", { name: "Passwort ändern" })).toBeDisabled();
  await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill(NEW_PASSWORD);

  await page.getByRole("button", { name: "Passwort ändern" }).click();

  await expect(page.getByText("Passwort geändert.")).toBeVisible();

  // The session that made the change survives it — no redirect to /anmelden.
  await expect(page).toHaveURL(/\/account$/);

  // /account also has its own page-level "Abmelden" button; scope to the header
  // (role=banner) so this doesn't collide with it, same as helpers.ts's logout().
  await openMobileMenu(page);
  await page.getByRole("banner").getByRole("button", { name: "Abmelden" }).click();

  await login(page, email, NEW_PASSWORD);
  await expect(page).not.toHaveURL(/\/anmelden/);
});
