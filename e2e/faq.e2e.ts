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
import { expect, type Page, test } from "@playwright/test";

import {
  deleteFaqEntriesByContext,
  deleteUserByEmail,
  faqFeedbackByUserAndEntry,
  grantLocalBoard,
  seedGroup,
  uniqueSlug,
} from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

/**
 * Ends the session so the next `registerVerifyLogin` starts clean.
 *
 * Deliberately not `logout()` from `./helpers/flows`: that helper opens the
 * `md:hidden` hamburger disclosure (`summary[aria-label="Menü öffnen"]`) to
 * reach the header's "Abmelden", so it only works at the suite's default
 * mobile viewport. The specs below run at 1280×900, where the hamburger is
 * not rendered and the account menu is a separate desktop `<details>`
 * dropdown that nothing opens — the click would wait out the timeout.
 * Dropping the session cookie is viewport-independent and is all these specs
 * need; the logout UI itself is covered by auth.e2e.ts.
 */
async function endSession(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/**
 * Reads the "Offene FAQ-Fragen" badge count from /federal/overview.
 * ActionStrip omits the link entirely at count 0 (spec §6), so an absent
 * link means 0 rather than a missing element to wait out.
 */
async function readFaqOpenCount(page: Page): Promise<number> {
  const link = page.getByRole("link", { name: /Offene FAQ-Fragen/ });
  if ((await link.count()) === 0) return 0;
  const badge = await link.locator("span").first().innerText();
  return Number(badge.trim());
}

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job (see e2e/board.e2e.ts:
// federal access comes from the JWT, granted at login when the email matches
// this env var — there is no per-test DB grant helper for it).
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test("a guest visiting /faq is redirected to login", async ({ page }) => {
  await page.goto("/faq");
  await page.waitForURL("**/anmelden**");
  expect(page.url()).toContain("/anmelden");
});

test("a signed-in member opens the FAQ, role section visible and collapsed", async ({ page }) => {
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

  // Every entry starts collapsed, the viewer's own section included — only a
  // search hit or a deep link (`forceOpen` in FaqEntryCard.tsx) opens one. The
  // open/closed state lives on each entry's own <details>, so assert it there.
  await expect(page.locator("#bereich-mitglieder details").first()).not.toHaveAttribute("open", "");
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
    await endSession(page);

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
    await endSession(page);

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

  test("a saved draft is resumed, not forked into a second entry", async ({ page }) => {
    const question = `E2E-Fortsetzen ${uniqueSlug("f")}?`;
    const edited = `${question} (überarbeitet)`;

    const memberEmail = "faq-fortsetzen-einreicher@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Fortsetz" });
    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
    await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
    await page.getByRole("dialog").getByText("Schließen", { exact: true }).click();
    await endSession(page);

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();

    // First pass: start the answer and park it as a draft. Renaming the
    // question is what makes the second pass provable — a fresh entry would
    // come back prefilled with the submission's original wording.
    const card = page.getByRole("article").filter({ hasText: question });
    await card.getByRole("button", { name: "Antwort verfassen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Frage").fill(edited);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();

    // The submission stays open, now flagged, and the button changes verb.
    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();
    const flagged = page.getByRole("article").filter({ hasText: question });
    await expect(flagged.getByText("Entwurf angelegt")).toBeVisible();
    await expect(flagged.getByRole("button", { name: "Antwort verfassen" })).toHaveCount(0);

    // Second pass: the dialog reopens the parked draft, not an empty form.
    await flagged.getByRole("button", { name: "Entwurf fortsetzen" }).click();
    await expect(dialog.getByPlaceholder("Frage")).toHaveValue(edited);
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/federal/faq");
    await page.getByRole("tab", { name: /Offene Fragen/ }).click();
    await expect(page.getByRole("article").filter({ hasText: question })).toHaveCount(0);

    // Exactly one entry came out of the two passes — the resumed draft. A
    // fork would leave the original wording behind as a stranded draft.
    await page.getByRole("tab", { name: "Fragen & Antworten" }).click();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(1);
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
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
    await endSession(page);

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

  test("an open submission surfaces on the federal overview", async ({ page }) => {
    const question = `E2E-Zaehler ${uniqueSlug("z")}?`;

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/overview");
    const before = await readFaqOpenCount(page);
    await endSession(page);

    const memberEmail = "faq-zaehler-einreicher@e2e.bdas.test";
    await deleteUserByEmail(memberEmail);
    await registerVerifyLogin(page, { email: memberEmail, firstName: "Faq", lastName: "Zaehler" });
    await page.goto("/faq");
    await page.getByRole("button", { name: "Frage einreichen" }).first().click();
    await page.getByRole("dialog").getByLabel("Deine Frage").fill(question);
    await page.getByRole("dialog").getByRole("button", { name: "Absenden" }).click();
    await expect(page.getByRole("dialog").getByText("Danke!", { exact: false })).toBeVisible();
    // The confirmation dialog stays open after submitting; dismiss it before
    // logging out, same as the "discards a submission" test above.
    await page.getByText("Schließen", { exact: true }).click();
    await endSession(page);

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });
    await page.goto("/federal/overview");
    await expect(page.getByRole("link", { name: /Offene FAQ-Fragen/ })).toBeVisible();
    const after = await readFaqOpenCount(page);
    expect(after).toBe(before + 1);
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
    // Entries start collapsed, so open the first one before reaching for its
    // footer — the thumbs are inside the collapsed body and not clickable.
    //
    // Scoped to the section, not `page.locator("details")`: the production
    // header renders its own `<details>` dropdowns ("Über uns", "Faq", the
    // mobile hamburger), so an unscoped `.first()` resolves to a nav dropdown
    // instead of an entry. The dev server renders none of those, which is why
    // the unscoped version passed locally and failed in CI.
    const firstEntry = page.locator("#bereich-mitglieder details").first();
    const entryId = await firstEntry.getAttribute("id");
    await firstEntry.locator("summary").click();

    // Click thumbs up and verify optimistic state (renders immediately before
    // the Server Action resolves).
    const thumbUp = firstEntry.getByRole("button", { name: "Hilfreich", exact: true });
    await thumbUp.click();
    await expect(thumbUp).toHaveAttribute("aria-pressed", "true");

    // Verify persistence: poll the DB for this member's vote on this entry.
    // Polling rather than a one-shot read after `waitForLoadState`, because
    // the pressed state above is optimistic — it flips before the Server
    // Action resolves, so a single read races the commit. This still fails if
    // the action never runs or never calls upsertFeedback; it just waits for
    // the round trip instead of assuming it already happened.
    await expect
      .poll(async () => (await faqFeedbackByUserAndEntry(memberEmail, entryId!))?.helpful ?? null)
      .toBe(true);
  });
});

test.describe("Kontextuelle Hilfe", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("the help route rejects a signed-out request", async ({ page }) => {
    const res = await page.request.get("/api/faq/help?context=dateien");
    expect(res.status()).toBe(401);
  });

  test("the help route returns only entries the viewer may see", async ({ page }) => {
    const email = "faq-hilfe-api@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Hilfe" });

    const res = await page.request.get("/api/faq/help?context=dateien");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
      contextIds: string[];
      popularIds: string[];
    };
    // A plain member never sees the Bundesvorstand section (visibility.ts).
    const questions = body.entries.map((e) => e["question"]).join(" ");
    expect(questions).not.toContain("Bundesvorstand");
    expect(body.entries.length).toBeGreaterThan(0);

    // `context` only selects which entries are highlighted — it never widens
    // the result set, so both id lists must resolve inside `entries`.
    const allIds = new Set(body.entries.map((e) => e["id"]));
    for (const id of [...body.contextIds, ...body.popularIds]) {
      expect(allIds.has(id)).toBe(true);
    }

    // The wire shape is FaqHelpEntry only — no leaked fields (topic,
    // relatedIds, updatedAtIso, contexts) that /faq's full view carries.
    for (const e of body.entries) {
      expect(Object.keys(e).sort()).toEqual(
        ["body", "id", "question", "searchText", "youtubeId"].sort(),
      );
    }

    // Entries travel once. A regression that inlined the subsets again would
    // still satisfy every assertion above.
    expect(Object.keys(body).sort()).toEqual(["contextIds", "entries", "popularIds"]);
  });

  test("omitting context returns everything visible with nothing pinned", async ({ page }) => {
    const email = "faq-hilfe-api-nocontext@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Ohnekontext" });

    const res = await page.request.get("/api/faq/help");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: unknown[];
      contextIds: string[];
    };
    expect(body.contextIds).toEqual([]);
    expect(body.entries.length).toBeGreaterThan(0);
  });

  test("the help panel shows the entries assigned to the route", async ({ page }) => {
    // Nothing in the seed is pinned to a context (migrations/0002_seed.sql
    // writes no faq_entry_contexts rows), so the board creates one first.
    const question = `E2E-Kontexthilfe ${uniqueSlug("k")}?`;

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    await page.goto("/federal/faq");
    await page.getByRole("button", { name: "+ Eintrag" }).click();
    const entryDialog = page.getByRole("dialog");
    await entryDialog.getByPlaceholder("Frage").fill(question);
    // "Anzeigen bei: Dateien" — the FilterChip for the `dateien` registry key.
    await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
    await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();

    // /dateien maps to the `dateien` context (contexts.ts).
    await page.goto("/dateien");
    await page.getByRole("button", { name: "Hilfe öffnen" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Passend zu dieser Seite")).toBeVisible();
    await expect(panel.getByText(question, { exact: true })).toBeVisible();
  });

  test("the panel closes on 'Alle FAQ ansehen' and refetches for the new route", async ({
    page,
  }) => {
    // Covers two regressions at once, both caused by the launcher living in
    // the root layout, which the App Router does not remount on a client-side
    // navigation:
    //   1. the payload was cached in a single slot, so the panel kept showing
    //      the previous route's entries under "Passend zu dieser Seite";
    //   2. the "Alle FAQ ansehen" link navigated without closing the sheet,
    //      which showModal() keeps in the top layer over the destination.
    // The link itself is the client-side navigation, so page.goto (a full
    // reload, which would reset the state and hide both bugs) is not used.
    const question = `E2E-Kontextwechsel ${uniqueSlug("w")}?`;
    await deleteFaqEntriesByContext("dateien");

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    await page.goto("/federal/faq");
    await page.getByRole("button", { name: "+ Eintrag" }).click();
    const entryDialog = page.getByRole("dialog");
    await entryDialog.getByPlaceholder("Frage").fill(question);
    await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
    await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();

    await page.goto("/dateien");
    await page.getByRole("button", { name: "Hilfe öffnen" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel.getByText("Passend zu dieser Seite")).toBeVisible();
    await expect(panel.getByText(question, { exact: true })).toBeVisible();

    await panel.getByRole("link", { name: "Alle FAQ ansehen" }).click();
    await expect(page).toHaveURL(/\/faq$/);
    // Bug 2: the sheet used to stay in the top layer over the FAQ page.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // /faq matches no registry key (contexts.ts), so the panel must fall back
    // to "Beliebte Fragen". Bug 1 showed the cached /dateien entries instead.
    await page.getByRole("button", { name: "Hilfe öffnen" }).click();
    const reopened = page.getByRole("dialog");
    await expect(reopened.getByText("Beliebte Fragen")).toBeVisible();
    await expect(reopened.getByText("Passend zu dieser Seite")).toHaveCount(0);
  });

  test("the launcher stays off public pages", async ({ page }) => {
    const email = "faq-hilfe-public@e2e.bdas.test";
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Public" });

    await page.goto("/gruppen");
    await expect(page.getByRole("button", { name: "Hilfe öffnen" })).toHaveCount(0);
  });

  test("FaqHinweis renders the pinned entry inline on /dateien", async ({ page }) => {
    // FaqHinweis caps at MAX_ENTRIES=3 (unlike the uncapped help panel), so
    // this assertion needs a clean slate — see deleteFaqEntriesByContext.
    await deleteFaqEntriesByContext("dateien");

    const question = `E2E-Hinweis ${uniqueSlug("h")}?`;

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    await page.goto("/federal/faq");
    await page.getByRole("button", { name: "+ Eintrag" }).click();
    const entryDialog = page.getByRole("dialog");
    await entryDialog.getByPlaceholder("Frage").fill(question);
    await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
    await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();

    await page.goto("/dateien");
    const hinweis = page.getByRole("complementary").filter({ hasText: "Hilfe zu dieser Seite" });
    await expect(hinweis).toBeVisible();
    await expect(hinweis.getByText(question, { exact: true })).toBeVisible();
  });

  test("FaqHinweis caps at three entries even when four are pinned", async ({ page }) => {
    // A local database survives between runs and nothing else drops the
    // entries the specs above pin to `dateien` — clear them first so "exactly
    // N of the M I create are visible" tests the cap, not leftover state from
    // an earlier run (see deleteFaqEntriesByContext).
    await deleteFaqEntriesByContext("dateien");

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    // Created in this order, so position (append-only) makes the first three
    // the only ones the after-visibility slice keeps — the fourth is the one
    // the cap must drop.
    const questions = [1, 2, 3, 4].map((n) => `E2E-Kappung ${n} ${uniqueSlug("c")}?`);
    await page.goto("/federal/faq");
    for (const question of questions) {
      await page.getByRole("button", { name: "+ Eintrag" }).click();
      const entryDialog = page.getByRole("dialog");
      await entryDialog.getByPlaceholder("Frage").fill(question);
      await entryDialog.getByRole("button", { name: "Dateien", exact: true }).click();
      await entryDialog.getByRole("button", { name: "Veröffentlichen" }).click();
      await expect(page.getByText(question, { exact: true })).toBeVisible();
    }

    await page.goto("/dateien");
    const hinweis = page.getByRole("complementary").filter({ hasText: "Hilfe zu dieser Seite" });
    await expect(hinweis).toBeVisible();
    // MAX_ENTRIES = 3 (FaqHinweis.tsx): exactly three accordions render, no
    // matter that four entries are pinned to this context.
    await expect(hinweis.locator("details")).toHaveCount(3);
    for (const question of questions.slice(0, 3)) {
      await expect(hinweis.getByText(question, { exact: true })).toBeVisible();
    }
    await expect(hinweis.getByText(questions[3]!, { exact: true })).toHaveCount(0);
  });

  test("a signed-out visitor sees no FaqHinweis aside on /dateien", async ({ page }) => {
    // Every Playwright test starts with a fresh, cookie-less context (see the
    // config's `storageState`), so no explicit sign-out is needed here.
    await page.goto("/dateien");
    await expect(page.getByRole("link", { name: "melde dich an" })).toBeVisible();
    await expect(
      page.getByRole("complementary").filter({ hasText: "Hilfe zu dieser Seite" }),
    ).toHaveCount(0);
  });
});
