/**
 * §23 — "a user can view all groups at /gruppen and a single group at
 * /gruppen/[slug] with content sourced from the database." Also asserts an
 * archived group is absent from the public active list.
 */
import { expect, test } from "@playwright/test";

import { seedGroup, uniqueSlug } from "./helpers/db";

test("public group list and detail render from the DB; archived is hidden", async ({ page }) => {
  const activeName = "E2E Aktive Gruppe";
  const activeSlug = uniqueSlug("e2e-aktiv");
  const archivedName = "E2E Archivierte Gruppe";
  const archivedSlug = uniqueSlug("e2e-archiv");

  await seedGroup({ slug: activeSlug, name: activeName, city: "Teststadt", status: "active" });
  await seedGroup({ slug: archivedSlug, name: archivedName, city: "Altstadt", status: "archived" });

  await page.goto("/gruppen");
  await expect(page.getByText(activeName)).toBeVisible();
  await expect(page.getByText(archivedName)).toHaveCount(0);

  // The card links to the detail page.
  await page.getByRole("link", { name: new RegExp(activeName) }).click();
  await page.waitForURL(`**/gruppen/${activeSlug}`);
  await expect(page.getByText(activeName)).toBeVisible();
});
