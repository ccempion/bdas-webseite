/**
 * FAQ suite (#133, extended by FAQ-Suite v2 PR 2): the role-aware /faq page.
 *  - A guest is bounced to the login page.
 *  - A signed-in member reaches /faq directly (no footer/header entry point
 *    while the feature is still incomplete — see commit 683bb70). The section
 *    matching their role (Mitglieder) is visible and its entries render
 *    expanded, while a board-only section (Bundesvorstand) isn't rendered at
 *    all (no grant admits it).
 *  - Behind `faq_suite`, the DB-backed docs layout (rail + search with
 *    `<mark>` highlighting) is reachable and usable.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

test("a guest visiting /faq is redirected to login", async ({ page }) => {
  await page.goto("/faq");
  await page.waitForURL("**/anmelden**");
  expect(page.url()).toContain("/anmelden");
});

test("a signed-in member opens the FAQ, role section visible and expanded", async ({ page }) => {
  const email = "faq-member@e2e.bdas.test";
  await deleteUserByEmail(email);
  await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Mitglied" });

  await page.goto("/faq");

  // Plain member → the Mitglieder section is rendered (its intro shows) …
  await expect(page.getByText("Was du als Mitglied auf der Plattform tun kannst.")).toBeVisible();
  // … while the board-only section isn't rendered at all (no grant admits it).
  await expect(
    page.getByText("Föderationsweite Funktionen unter „Bundesverband“.", { exact: false }),
  ).toBeHidden();

  // Visibility alone doesn't prove expansion — every visible section's intro
  // renders unconditionally (FaqExplorer.tsx). The actual open/closed state
  // lives on each entry's own <details>, so assert that directly: a plain
  // member's primary section is `defaultOpen` (order.ts), so its first entry
  // renders already expanded.
  await expect(page.locator("#bereich-mitglieder details").first()).toHaveAttribute("open", "");
});

// The rail only renders at the `lg` breakpoint (`FaqExplorer.tsx`); the
// suite's default project is a mobile viewport (Pixel 7), same reasoning as
// the Puck-authoring block in content-pages.e2e.ts.
test.describe("docs layout (desktop)", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a signed-in member sees the docs layout and searches", async ({ page }) => {
    const email = "faq-suche@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Sucher" });

    await page.goto("/faq");
    await expect(page.getByRole("heading", { level: 1, name: /FAQ & Hilfe/ })).toBeVisible();
    // Rail (Desktop-Viewport der Suite): Bereichs-Anker des Mitglieds sichtbar.
    await expect(page.getByRole("link", { name: "Mitglieder" })).toBeVisible();

    // Suche filtert und hebt hervor: eine Frage aus dem Seed ansuchen.
    await page.getByPlaceholder("Suche").fill("Gruppe");
    await expect(page.locator("mark").first()).toBeVisible();
  });
});
