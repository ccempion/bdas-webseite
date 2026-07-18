/**
 * Editable content pages (spec 2026-07-14, extended 2026-07-18): the public
 * BSR / BDAJ / Impressum / Datenschutz pages + editor gating. Requires
 * BDAS_FLAG_CONTENT=true and BDAS_FLAG_PUBLIC_SHELL=true in the e2e env, plus
 * federal@e2e.bdas.test on BDAS_FEDERAL_BOARD_EMAILS (CI has both).
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

const FEDERAL_EMAIL = "federal@e2e.bdas.test";

/** Every board-editable content page: public path + its <h1>. */
const EDITABLE_PAGES = [
  {
    name: "BSR",
    path: "/ueber-uns/bundessprecherinnenrat",
    heading: "Bundessprecher*innenrat",
  },
  {
    name: "BDAJ",
    path: "/ueber-uns/bdaj",
    heading: "Bund der Alevitischen Jugendlichen (BDAJ)",
  },
  { name: "Impressum", path: "/impressum", heading: "Impressum" },
  { name: "Datenschutz", path: "/datenschutz", heading: "Datenschutzerklärung" },
] as const;

test.describe("content pages", () => {
  for (const p of EDITABLE_PAGES) {
    test(`visitor sees the ${p.name} page without an edit button`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
      await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);
    });

    test(`anonymous ${p.name} /bearbeiten is a 404`, async ({ page }) => {
      const res = await page.goto(`${p.path}/bearbeiten`);
      expect(res?.status()).toBe(404);
    });
  }

  test("federal board reaches the Puck editor from every editable page", async ({ page }) => {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Fed",
      lastName: "Eral",
    });

    for (const p of EDITABLE_PAGES) {
      await page.goto(p.path);
      await page.getByRole("link", { name: "Seite bearbeiten" }).click();
      // Puck's chrome is English (ADR 0023). On mobile viewports its header
      // collapses the actions behind a "Toggle menu bar" chevron, and the
      // Publish control renders as a <span>, not a <button> (Puck 0.22).
      await page.getByRole("button", { name: "Toggle menu bar" }).click();
      await expect(page.getByText("Publish", { exact: true })).toBeVisible();
    }
  });
});
