/**
 * Newsletter PR 5 — the board list (spec §8, §12 no. 5).
 *  - A federal board member sees a subscribed address, the tile agrees with
 *    the rows beneath it, and the export comes back as a CSV containing that
 *    address.
 *  - A plain member reaches neither the page nor the file.
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test, type Page } from "@playwright/test";

import { deleteUserByEmail, resetNewsletterRateLimits } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

const unique = () => `nlb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.org`;

/** The number a tile shows, by its label. */
async function tileValue(page: Page, label: string): Promise<number> {
  const tile = page.locator("[data-newsletter-tiles] > div").filter({ hasText: label });
  return Number(await tile.locator("div").first().innerText());
}

/** How many address rows the table currently shows. */
const visibleRows = (page: Page) => page.locator('tbody tr:has-text("@")').count();

test.describe("newsletter, the board list", () => {
  test("the board sees the list, the tiles agree with it, and the export is a CSV", async ({
    page,
  }) => {
    await resetNewsletterRateLimits();
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
      newsletter: true,
    });

    await page.goto("/federal/newsletter");
    await expect(page.getByRole("heading", { name: "Newsletter" })).toBeVisible();
    await expect(page.getByRole("cell", { name: FEDERAL_EMAIL })).toBeVisible();

    // Tiles and table come out of the same deduplicated pipeline, so the
    // "Abonniert" tile must equal the rows left after the "Abonniert" chip.
    const subscribed = await tileValue(page, "Abonniert");
    expect(subscribed).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Abonniert", exact: true }).click();
    await expect(page.locator('tbody tr:has-text("@")')).toHaveCount(subscribed);

    // The search narrows to the one address, and the export ignores the filter.
    await page.getByLabel("Adresse suchen").fill(FEDERAL_EMAIL);
    expect(await visibleRows(page)).toBe(1);

    const csv = await page.request.get("/federal/newsletter/export.csv");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(csv.headers()["content-disposition"]).toContain("attachment");
    const body = await csv.text();
    // The BOM Excel needs, the header, and the address.
    expect(body.startsWith("﻿")).toBe(true);
    expect(body).toContain("email,status,source");
    expect(body).toContain(FEDERAL_EMAIL);
  });

  test("a plain member reaches neither the page nor the file", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email });

      // The board layout redirects a non-board account away from the cockpit;
      // the file answers with a bare 404, because a redirect to an HTML page
      // is the wrong answer to a download request.
      await page.goto("/federal/newsletter");
      await expect(page).toHaveURL(/\/account/);
      await expect(page.getByRole("cell", { name: email })).toHaveCount(0);

      const csv = await page.request.get("/federal/newsletter/export.csv");
      expect(csv.status()).toBe(404);
    } finally {
      await deleteUserByEmail(email);
    }
  });
});
