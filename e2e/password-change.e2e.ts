/**
 * §23 — a signed-in member can change their password without their inbox.
 * Split out of auth.e2e.ts, which is already one long linear flow.
 */
import { expect, test } from "@playwright/test";

import { login, logout, PASSWORD, register, submitAndSettle, verify } from "./helpers/flows";

const NEW_PASSWORD = "Ganz-Anderes-Pferd-7!";

test("change the password from /account, then sign in with the new one", async ({ page }) => {
  const email = `pw-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page, email);
  await login(page, email);

  await page.goto("/account");
  // getByRole("group", …) doesn't match this <details> markup; target the summary directly.
  await page.locator("details:has(summary:text('Passwort ändern')) summary").click();

  // Wrong current password: the action's isAppError branch renders the error
  // Alert, and nothing is written.
  await page.getByLabel("Aktuelles Passwort", { exact: true }).fill("Falsch-Falsch-1!");
  await page.getByLabel("Neues Passwort", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill(NEW_PASSWORD);
  await submitAndSettle(page, page.getByRole("button", { name: "Passwort ändern" }));
  await expect(page.getByText("Aktuelles Passwort ist falsch.")).toBeVisible();

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

  await logout(page);

  await login(page, email, NEW_PASSWORD);
  await expect(page).not.toHaveURL(/\/anmelden/);
});
