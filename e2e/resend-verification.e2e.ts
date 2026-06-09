/**
 * Resend-verification feature (shipped on main): an unverified login surfaces a
 * "Bestätigungsmail erneut senden" link, and the resend page issues a fresh
 * verification token. Uses a freshly-registered (unverified) account — no
 * hardcoded credentials, no assumptions about existing prod data.
 */
import { expect, test } from "@playwright/test";

import { latestVerifyToken, resetRateLimits, uniqueEmail } from "./helpers/db";
import { PASSWORD, register } from "./helpers/flows";

test("unverified login surfaces the resend link, which issues a fresh token", async ({ page }) => {
  const email = uniqueEmail("resend");
  await register(page, { email }); // registered but NOT verified

  // The token minted at registration.
  let firstToken: string | null = null;
  await expect(async () => {
    firstToken = await latestVerifyToken(email);
    expect(firstToken).toBeTruthy();
  }).toPass({ timeout: 10_000 });

  // Logging in unverified must not reach /account; it surfaces the resend link.
  await resetRateLimits();
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();

  const resendLink = page.getByRole("link", { name: "Bestätigungsmail erneut senden" });
  await expect(resendLink).toBeVisible();

  // Follow it and resend.
  await resendLink.click();
  await page.waitForURL("**/verifizierung-erneut-senden");
  await expect(page.getByRole("heading", { name: "Bestätigungsmail erneut senden" })).toBeVisible();
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: "Bestätigungsmail senden" }).click();
  await expect(page.getByText("E-Mail gesendet")).toBeVisible();

  // A fresh verification token must have been issued.
  await expect(async () => {
    const latest = await latestVerifyToken(email);
    expect(latest).toBeTruthy();
    expect(latest).not.toBe(firstToken);
  }).toPass({ timeout: 10_000 });
});
