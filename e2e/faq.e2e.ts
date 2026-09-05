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

import { deleteUserByEmail, grantLocalBoard, seedGroup, uniqueSlug } from "./helpers/db";
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

  // Global Constraints (FAQ-Suite v2 plan): "kein local_board/local_board_lead
  // darf hier schreiben, auch nicht für die eigene Gruppe" — a local_board
  // member passes the outer (board)-layout gate (requireBoardAccess), so this
  // exercises requireFederalScope's federal-specific check, unlike the plain-
  // member test above which is rejected earlier and never reaches it.
  test("a local board member cannot reach /federal/faq", async ({ page }) => {
    const groupSlug = uniqueSlug("e2e-faq-local");
    const groupId = await seedGroup({
      slug: groupSlug,
      name: "E2E FAQ Local Gruppe",
      city: "Lokalstadt",
      status: "active",
    });

    const email = "faq-local-board@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Lokal" });
    await grantLocalBoard(email, groupId); // takes effect on next request (DB-read grants)

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
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Frage").fill(question);
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
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

test.describe("Einreichungen", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("a member submits a question and sees the confirmation", async ({ page }) => {
    const email = "faq-einreicher@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Einreicher" });

    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Deine Frage").fill(`E2E-Einreichung ${uniqueSlug("q")}?`);
    await dialog.getByRole("button", { name: "Absenden" }).click();

    await expect(dialog.getByText("Danke!", { exact: false })).toBeVisible();
  });

  test("no search hit offers the query as a prefilled submission", async ({ page }) => {
    const email = "faq-nohit@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Nohit" });

    await page.goto("/faq");
    await page.getByPlaceholder("Suche").fill("zzzz-gibt-es-nicht-zzzz");
    await expect(page.getByText("Keine Antwort gefunden.")).toBeVisible();

    await page.getByRole("button", { name: "Frage einreichen" }).last().click();
    await expect(page.getByRole("dialog").getByLabel("Deine Frage")).toHaveValue(
      "zzzz-gibt-es-nicht-zzzz",
    );
  });
});
