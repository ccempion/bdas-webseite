/**
 * §23 board flows:
 *  - "a federal board member can create a new group, edit it, and archive it."
 *  - "a local board member can … approve a pending member."
 *
 * Federal access comes from the JWT: the login service adds `federal_board`
 * when the email is in BDAS_FEDERAL_BOARD_EMAILS (login.ts). The CI `e2e` job
 * sets that env to FEDERAL_EMAIL below.
 */
import { expect, test } from "@playwright/test";

import {
  closeDb,
  deleteUserByEmail,
  grantLocalBoard,
  memberStatusByEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { createProfile, logout, registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test.afterAll(async () => {
  await closeDb();
});

test("federal board can create, edit, and archive a group", async ({ page }) => {
  // Idempotent across retries (fixed email in a shared DB).
  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });

  const slug = uniqueSlug("e2e-board");
  const name = "E2E Board Gruppe";

  // Create (active).
  await page.goto("/admin/gruppen/neu");
  await page.getByLabel(/Kürzel/).fill(slug);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Stadt").fill("Boardstadt");
  await page.locator("#status").selectOption("active");
  await page.getByRole("button", { name: "Gruppe anlegen" }).click();
  await page.waitForURL("**/admin/gruppen");

  // It is now public.
  await page.goto("/gruppen");
  await expect(page.getByText(name)).toBeVisible();

  // Edit the name.
  const edited = `${name} (bearbeitet)`;
  await page.goto(`/admin/gruppen/${slug}/bearbeiten`);
  await page.getByLabel("Name").fill(edited);
  await page.getByRole("button", { name: "Änderungen speichern" }).click();
  await page.waitForURL("**/admin/gruppen");
  await page.goto("/gruppen");
  await expect(page.getByText(edited)).toBeVisible();

  // Archive — confirm() must be accepted.
  page.once("dialog", (d) => d.accept());
  await page.goto(`/admin/gruppen/${slug}/bearbeiten`);
  await page.getByRole("button", { name: "Gruppe archivieren" }).click();
  await expect(async () => {
    await page.goto("/gruppen");
    await expect(page.getByText(edited)).toHaveCount(0);
  }).toPass();
});

test("a local board member can approve a pending member of their group", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-approve"),
    name: "E2E Approve Gruppe",
    city: "Freigabestadt",
    status: "active",
  });

  // A pending member who chose this group.
  const pendingEmail = uniqueEmail("pending");
  const pendingLast = `P${Date.now().toString().slice(-6)}`;
  await registerVerifyLogin(page, { email: pendingEmail });
  await createProfile(page, { firstName: "Wartend", lastName: pendingLast, groupId });
  await logout(page);

  // A local_board member of the same group.
  const localEmail = uniqueEmail("local");
  await registerVerifyLogin(page, { email: localEmail });
  await createProfile(page, { firstName: "Lokal", lastName: "Vorstand" });
  await grantLocalBoard(localEmail, groupId); // takes effect on next request (DB-read grants)

  // Approve the pending member from the board screen.
  await page.goto("/admin/pending-members");
  const row = page.locator("li", { hasText: pendingLast });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Freigeben" }).click();

  await expect(async () => {
    expect(await memberStatusByEmail(pendingEmail)).toBe("active");
  }).toPass();
});
