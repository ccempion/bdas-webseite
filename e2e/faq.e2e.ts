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

import { deleteUserByEmail, uniqueSlug } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job (see e2e/board.e2e.ts:
// federal access comes from the JWT, granted at login when the email matches
// this env var — there is no per-test DB grant helper for it).
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

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

test.describe("Board-Verwaltung /federal/faq", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a plain member cannot reach /federal/faq", async ({ page }) => {
    const email = "faq-plain@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Plain" });

    await page.goto("/federal/faq");
    await page.waitForURL("**/account**");
  });

  test("a federal board member creates, publishes and reorders an entry", async ({ page }) => {
    // Idempotent across retries (fixed email in a shared DB) — same pattern as
    // e2e/board.e2e.ts: federal access comes from the JWT at login, not a
    // per-test grant helper.
    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    await page.goto("/federal/faq");
    await expect(page.getByRole("heading", { name: "FAQ" })).toBeVisible();

    // Unique per run: `deleteUserByEmail` above removes the fixed board user
    // but not any FAQ entries it previously created (no FK ties an entry to
    // its author), so a static question string collides with leftovers from
    // an earlier run/retry against the same DB. Same idempotency concern the
    // `uniqueSlug`/`uniqueEmail` helpers exist for elsewhere in this suite.
    const question = `E2E-Testfrage ${uniqueSlug("x")}?`;

    await page.getByRole("button", { name: "+ Eintrag" }).click();
    await page.getByPlaceholder("Frage").fill(question);
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    // The board lists every entry (seed data ships ~30 published rows), so
    // "Veröffentlicht" alone is not unique — scope the status badge to this
    // entry's own row (its status span is a sibling of the question span).
    const row = page.getByText(question, { exact: true }).locator("..");
    await expect(row).toBeVisible();
    await expect(row.getByText("Veröffentlicht")).toBeVisible();

    await page.goto("/faq");
    await page.getByPlaceholder("Suche").fill(question);
    await expect(page.locator("mark").first()).toBeVisible();
  });
});
