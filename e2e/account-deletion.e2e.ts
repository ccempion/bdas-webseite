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
