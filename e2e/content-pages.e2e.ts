/**
 * Editable content pages (spec 2026-07-14, extended 2026-07-18): the public
 * BSR / BDAJ / Impressum / Datenschutz pages + editor gating. Requires
 * BDAS_FLAG_CONTENT=true and BDAS_FLAG_PUBLIC_SHELL=true in the e2e env, plus
 * federal@e2e.bdas.test on BDAS_FEDERAL_BOARD_EMAILS (CI has both).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

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
  {
    name: "Verbandsstruktur",
    path: "/ueber-uns/verbandsstruktur",
    heading: "Verbandsstruktur",
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

  // Authoring runs on a desktop viewport. §23 asks for mobile because it is
  // about what *visitors* see; the Puck editor is a board tool. On a 380px
  // viewport the open Blocks panel covers the canvas — the root DropZone sits
  // above the viewport (measured y = -270) and any drop that lands does so by
  // accident. Desktop puts drawer and canvas on screen together.
  test.describe("authoring", () => {
    test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

    test("federal board adds a Button block and the visitor sees the link", async ({ page }) => {
      await deleteUserByEmail(FEDERAL_EMAIL);
      await registerVerifyLogin(page, { email: FEDERAL_EMAIL, firstName: "Fed", lastName: "Eral" });

      await page.goto("/ueber-uns/bdaj/bearbeiten");
      await dragBlockIntoCanvas(page, "Button");

      // Publishing appends to whatever the page already holds, and content
      // survives between runs — label this run's block uniquely so the
      // assertion cannot match a leftover from an earlier one.
      const label = `Zur BDAJ-Website ${Math.random().toString(36).slice(2, 8)}`;

      // Insertion selects the new block, so the inspector shows its fields.
      // Puck keeps a second, hidden copy of its sidebars in the DOM — always
      // take the visible one.
      await visible(page.getByLabel("Beschriftung")).fill(label);
      await visible(page.getByLabel(/^Link/)).fill("https://bdaj.de");
      // Publishing is a PUT to the content route; wait for it rather than
      // navigating away mid-save.
      const saved = page.waitForResponse(
        (r) => r.request().method() === "PUT" && r.url().includes("/api/content/pages/"),
      );
      await visible(page.getByText("Publish", { exact: true })).click();
      expect((await saved).ok()).toBe(true);

      await page.goto("/ueber-uns/bdaj");
      const link = page.getByRole("link", { name: label });
      await expect(link).toHaveAttribute("href", "https://bdaj.de");
      await expect(link).toHaveAttribute("rel", /noopener/);
    });

    test("the canvas is framed in page chrome and the public page keeps one header", async ({
      page,
    }) => {
      await deleteUserByEmail(FEDERAL_EMAIL);
      await registerVerifyLogin(page, { email: FEDERAL_EMAIL, firstName: "Fed", lastName: "Eral" });

      await page.goto("/ueber-uns/bdaj/bearbeiten");
      const canvas = page.frameLocator("iframe");
      // The chrome is decoration inside the canvas: it carries the visitor's
      // entries, never the signed-in board member's account menu.
      await expect(canvas.locator("header")).toHaveCount(1);
      await expect(canvas.locator("footer")).toHaveCount(1);
      await expect(canvas.getByText("Anmelden").first()).toBeVisible();
      await expect(canvas.getByText("Mein Konto")).toHaveCount(0);

      // The editor page itself still has exactly one header — the layout's. The
      // canvas one lives in an iframe and cannot collide with it.
      await expect(page.getByRole("banner")).toHaveCount(1);

      await page.goto("/ueber-uns/bdaj");
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
    });
  });
});

/** Puck renders a hidden duplicate of its sidebars; take the on-screen one. */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true }).first();
}

/**
 * Drag a block from Puck's drawer into the page canvas.
 *
 * Puck inserts through dnd-kit, which tracks pointer events: `click()` does not
 * insert, and `dragTo()` jumps straight to the target without the intermediate
 * moves that let dnd-kit start a drag and run collision detection. Drive the
 * mouse by hand — press, cross the activation threshold, then travel to the
 * root DropZone inside the preview iframe. `frameLocator(...).boundingBox()`
 * already returns page coordinates, so no manual offset maths is needed.
 */
async function dragBlockIntoCanvas(page: Page, blockName: string): Promise<void> {
  const item = visible(page.locator("[data-puck-drawer-item]").filter({ hasText: blockName }));
  await expect(item).toBeVisible();
  const zone = page.frameLocator("iframe").locator('[data-puck-dropzone="root:default-zone"]');
  await expect(zone).toBeVisible();

  const from = await item.boundingBox();
  const to = await zone.boundingBox();
  if (!from || !to)
    throw new Error(`dragBlockIntoCanvas: ${blockName} or the canvas is off-screen`);

  const sx = from.x + from.width / 2;
  const sy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + Math.min(60, to.height / 2);

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 8); // past dnd-kit's activation distance
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 20, sy + ((ty - sy) * i) / 20);
  }
  await page.mouse.up();
  await expect(page.getByText("No items", { exact: true })).toHaveCount(0);
}
