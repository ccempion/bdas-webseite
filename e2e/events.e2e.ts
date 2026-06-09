/**
 * Events module happy path (Phase 2): a federal board member creates and
 * publishes an event; a member registers (one click) then deregisters.
 * Exercises the UI / Server-Action / flag layer the integration test can't.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail, uniqueEmail } from "./helpers/db";
import { createProfile, logout, registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

/** A datetime-local value (YYYY-MM-DDTHH:mm) a week out. */
function futureLocal(daysAhead = 7): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

test("federal publishes an event; a member registers then deregisters", async ({ page }) => {
  const title = `E2E Event ${Date.now().toString().slice(-6)}`;

  // Federal board creates a public event, then publishes it.
  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });

  await page.goto("/admin/events/neu");
  await page.getByLabel("Titel").fill(title);
  await page.getByLabel("Beginn").fill(futureLocal());
  await page.locator("#visibility").selectOption("public");
  // groupId select defaults to "Föderationsweit" (federal) — leave it.
  await page.getByRole("button", { name: "Veranstaltung anlegen" }).click();
  await page.waitForURL("**/admin/events");

  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.waitForURL("**/admin/events/**");
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(page.getByText("Veröffentlicht")).toBeVisible();

  // A member registers for it, then cancels.
  await page.goto("/account"); // the logout button lives here
  await logout(page);
  await registerVerifyLogin(page, { email: uniqueEmail("evt-member") });
  await createProfile(page, { firstName: "Mit", lastName: "Glied" });

  await page.goto("/events");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.waitForURL("**/events/**");

  await page.getByRole("button", { name: "Anmelden" }).click();
  // Registered → the controls switch to the cancel ("Abmelden") button.
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
});
