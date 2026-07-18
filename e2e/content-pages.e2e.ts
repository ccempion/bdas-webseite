/**
 * Editable content pages (spec 2026-07-14): public BSR page + editor gating.
 * Requires BDAS_FLAG_CONTENT=true and BDAS_FLAG_PUBLIC_SHELL=true in the e2e
 * env, plus federal@e2e.bdas.test on BDAS_FEDERAL_BOARD_EMAILS (CI has both).
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test.describe("content pages", () => {
  test("visitor sees the BSR page without an edit button", async ({ page }) => {
    await page.goto("/ueber-uns/bundessprecherinnenrat");
    await expect(page.getByRole("heading", { name: "Bundessprecher*innenrat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);
  });

  test("anonymous /bearbeiten is a 404", async ({ page }) => {
    const res = await page.goto("/ueber-uns/bundessprecherinnenrat/bearbeiten");
    expect(res?.status()).toBe(404);
  });

  test("federal board reaches the Puck editor via the edit button", async ({ page }) => {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Fed",
      lastName: "Eral",
    });
    await page.goto("/ueber-uns/bundessprecherinnenrat");
    await page.getByRole("link", { name: "Seite bearbeiten" }).click();
    // Puck's chrome is English (ADR 0023). On mobile viewports its header
    // collapses the actions behind a "Toggle menu bar" chevron, and the
    // Publish control renders as a <span>, not a <button> (Puck 0.22).
    await page.getByRole("button", { name: "Toggle menu bar" }).click();
    await expect(page.getByText("Publish", { exact: true })).toBeVisible();
  });
});
