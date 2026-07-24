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

  test("federal board adds a Button block and the visitor sees the link", async ({ page }) => {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, { email: FEDERAL_EMAIL, firstName: "Fed", lastName: "Eral" });

    await page.goto("/ueber-uns/bdaj/bearbeiten");
    // Add the Button block from the Puck component list, then fill its fields.
    // On this mobile viewport Puck collapses its sidebars into Blocks/Outline/
    // Fields tabs, and keeps a second (hidden) copy of the component drawer in
    // the DOM — so open Blocks first, then take the one visible drawer item.
    await page.getByText("Blocks", { exact: true }).click();
    const buttonItem = page.getByText("Button", { exact: true }).filter({ visible: true }).first();
    await expect(buttonItem).toBeVisible();
    // The panel slides in while the preview iframe reflows behind it, so the
    // item never satisfies Playwright's stability check; click past it.
    await buttonItem.click({ force: true });
    await page.getByLabel("Beschriftung").fill("Zur BDAJ-Website");
    await page.getByLabel(/^Link/).fill("https://bdaj.de");
    // Publish (open the collapsed menu bar on mobile chrome — see BSR test note).
    await page.getByRole("button", { name: "Toggle menu bar" }).click();
    await page.getByText("Publish", { exact: true }).click();

    await page.goto("/ueber-uns/bdaj");
    const link = page.getByRole("link", { name: "Zur BDAJ-Website" });
    await expect(link).toHaveAttribute("href", "https://bdaj.de");
    await expect(link).toHaveAttribute("rel", /noopener/);
  });
});
