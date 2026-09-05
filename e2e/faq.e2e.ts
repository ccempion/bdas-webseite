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

import { deleteUserByEmail, faqFeedbackByUserAndEntry, grantLocalBoard, seedGroup, uniqueSlug } from "./helpers/db";
import { logout, registerVerifyLogin } from "./helpers/flows";

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

  test("the board sees an open submission in the Offene Fragen tab", async ({ page }) => {
    const question = `E2E-Frage-Board ${uniqueSlug("s")}?`;

    const memberEmail = "faq-board-einreicher@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, {
      email: memberEmail,
      firstName: "Faq",
      lastName: "Boardfrage",
    });
    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
    await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
    await page.getByRole("dialog").getByText("Schließen", { exact: true }).click();
    await logout(page);

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    await expect(page.getByText("Faq Boardfrage")).toBeVisible();
  });

  test("the board answers a submission and it leaves the open queue", async ({ page }) => {
    const question = `E2E-Antwortfrage ${uniqueSlug("a")}?`;

    const memberEmail = "faq-antwort-einreicher@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Antwort" });
    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
    await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
    await page.getByRole("dialog").getByText("Schließen", { exact: true }).click();
    await logout(page);

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();

    const card = page.getByRole("article").filter({ hasText: question });
    await card.getByRole("button", { name: "Antwort verfassen" }).click();

    const dialog = page.getByRole("dialog");
    // The entry form opens prefilled with the submitted question.
    await expect(dialog.getByPlaceholder("Frage")).toHaveValue(question);
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    // saveEntryAction runs inside a transition; wait for it to resolve and
    // close the dialog before navigating away, or the navigation can cancel
    // the in-flight Server Action request.
    await expect(dialog).toBeHidden();

    // Publishing the linked draft answers the submission: the open tab empties.
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();
    await expect(page.getByRole("article").filter({ hasText: question })).toHaveCount(0);

    // …and the answer is live on /faq.
    await page.goto("/faq");
    await page.getByPlaceholder("Suche").fill(question);
    await expect(page.locator("mark").first()).toBeVisible();
  });

  test("the board discards a submission after confirming", async ({ page }) => {
    const question = `E2E-Verwerfen ${uniqueSlug("v")}?`;

    const memberEmail = "faq-verwerf-einreicher@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Verwerf" });
    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
    await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
    // The confirmation dialog stays open after submitting — its backdrop
    // blocks the header, so dismiss it before logging out (see also line 159
    // above). The × close button also carries aria-label="Schließen", so
    // scope to the visible text, not the role, to avoid a strict-mode match
    // on both.
    await page.getByText("Schließen", { exact: true }).click();
    await logout(page);

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();

    const card = page.getByRole("article").filter({ hasText: question });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Verwerfen" }).click();
    // The confirmation is a modal (Spec §6), not window.confirm: scope to
    // the dialog, since the card's own "Verwerfen" button is still in the
    // DOM at this point too (a plain getByRole match would be ambiguous,
    // and would also find nothing — timing out rather than silently
    // passing — if this were a native confirm() instead of a real dialog).
    await page.getByRole("dialog").getByRole("button", { name: "Verwerfen" }).click();

    await expect(card).toHaveCount(0);
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

  test("a member rates an entry and the thumb stays pressed, vote persists to server", async ({
    page,
  }) => {
    const memberEmail = "faq-voter@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Wähler" });

    await page.goto("/faq");
    // A plain member's primary section is open by default (order.ts), so the
    // first entry's footer — and its thumbs — are already in the DOM. Grab
    // the entry ID from the details element to verify it later.
    const firstEntry = page.locator("details").first();
    const entryId = await firstEntry.getAttribute("id");

    // Click thumbs up and verify optimistic state (renders immediately before
    // the Server Action resolves).
    const thumbUp = firstEntry.getByRole("button", { name: "Hilfreich", exact: true });
    await thumbUp.click();
    await expect(thumbUp).toHaveAttribute("aria-pressed", "true");
    // Wait for the vote to reach the server (useTransition pending → false).
    await page.waitForLoadState("networkidle");

    // Verify persistence: query the database for this member's vote on this entry.
    // If the Server Action didn't actually run (or didn't call upsertFeedback), this will be null.
    const feedback = await faqFeedbackByUserAndEntry(memberEmail, entryId!);
    expect(feedback).toBeDefined();
    expect(feedback?.helpful).toBe(true);
  });
});
