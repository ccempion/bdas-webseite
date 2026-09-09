/**
 * Newsletter PR 4 — the offensive surfaces (spec §6).
 *  - The scroll panel appears halfway down a long page, never on a short one,
 *    and stays gone for the session once it is clicked away.
 *  - The tick on the guest registration creates a `pending` row; without it
 *    the registration writes nothing to the newsletter.
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  deleteNewsletterSubscriberByEmail,
  deleteUserByEmail,
  newsletterStatus,
  resetNewsletterRateLimits,
  uniqueEmail,
} from "./helpers/db";
import { logout, registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

const panel = (page: Page) => page.locator("[data-newsletter-panel]");

/** A datetime-local value (YYYY-MM-DDTHH:mm) a week out. */
function futureLocal(daysAhead = 7): string {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/** How many windows tall the page currently is — the quantity the trigger
 *  rule is written in. */
const pageRatio = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);

/**
 * Shrink the window until the page is comfortably over the three-window
 * threshold. Measuring beats picking a page and hoping it stays long — and the
 * assertion means a page that cannot be made long enough fails loudly instead
 * of letting the test pass without ever testing anything.
 */
async function makePageLong(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 412;
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(200, Math.floor(pageHeight / 4)) });
  expect(await pageRatio(page)).toBeGreaterThanOrEqual(3);
}

/**
 * The opposite: a window as tall as the page. The layout's `min-h-screen` then
 * stretches the body to exactly one window, so three are out of reach whatever
 * the page happens to contain.
 */
async function makePageShort(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 412;
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height: Math.max(200, pageHeight) });
  expect(await pageRatio(page)).toBeLessThan(3);
}

test.describe("newsletter, the offensive surfaces", () => {
  test("the scroll panel waits for half of a long page, then goes away for good", async ({
    page,
  }) => {
    await resetNewsletterRateLimits();
    await page.goto("/");
    await makePageLong(page);

    // At the top of the page the offer belongs to the footer, not here.
    await expect(panel(page)).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.6));
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Ich bin dabei" })).toBeVisible();

    await panel(page).getByRole("button", { name: "Hinweis schließen" }).click();
    await expect(panel(page)).toHaveCount(0);

    // "Weg für diesen Besuch" (§6.1): a reload in the same session, scrolled
    // just as far, must not bring it back.
    await page.reload();
    await makePageLong(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.9));
    await expect(panel(page)).toHaveCount(0);
  });

  test("the scroll panel never opens on a page barely taller than the window", async ({ page }) => {
    await page.goto("/");
    await makePageShort(page);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(panel(page)).toHaveCount(0);
  });

  test("the tick on the guest registration signs the guest up, and nothing does without it", async ({
    page,
  }) => {
    await resetNewsletterRateLimits();
    const title = `E2E Newsletter Event ${Date.now().toString().slice(-6)}`;
    const withTick = uniqueEmail("nl-gast-ja");
    const withoutTick = uniqueEmail("nl-gast-nein");

    await deleteUserByEmail(FEDERAL_EMAIL);
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

    await page.goto("/admin/events/neu");
    await page.getByLabel("Titel").fill(title);
    await page.getByLabel("Beginn").fill(futureLocal());
    await page.locator("#visibility").selectOption("public");
    await page.getByRole("button", { name: "Veranstaltung anlegen" }).click();
    await page.waitForURL(/\/admin\/events\/[^/]+\/edit$/);
    const manageUrl = page.url().replace(/\/edit$/, "");
    const eventUrl = `/events/${manageUrl.split("/").pop()}`;

    // Guest registration lives on the edit form, not on the create form —
    // creating saves a draft and lands here.
    await page.locator("#allowGuestRegistration").check();
    await page.getByRole("button", { name: "Speichern" }).click();

    await page.goto(manageUrl);
    await page.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect(page.getByText("Veröffentlicht")).toBeVisible();

    await page.goto("/account");
    await logout(page);

    try {
      // Without the tick: a registration and no newsletter row at all.
      await page.goto(eventUrl);
      // By id, not by label: the data-processing consent's own label contains
      // the word "Name", so `getByLabel("Name")` matches two controls.
      await page.locator("#guest-name").fill("Ohne Haken");
      await page.locator("#guest-email").fill(withoutTick);
      await page.getByRole("checkbox", { name: /einverstanden/ }).check();
      await page.getByRole("button", { name: "Als Gast anmelden" }).click();
      await expect(page.getByText("Anmeldung bestätigt")).toBeVisible();
      expect(await newsletterStatus(withoutTick)).toBeNull();

      // With the tick: the same registration plus a `pending` row waiting for
      // the confirmation mail (§3.2 — the tick is no shortcut past double opt-in).
      await page.goto(eventUrl);
      await page.locator("#guest-name").fill("Mit Haken");
      await page.locator("#guest-email").fill(withTick);
      await page.getByRole("checkbox", { name: /einverstanden/ }).check();
      await page.getByRole("checkbox", { name: /Newsletter/ }).check();
      await page.getByRole("button", { name: "Als Gast anmelden" }).click();
      await expect(page.getByText("Anmeldung bestätigt")).toBeVisible();
      expect(await newsletterStatus(withTick)).toBe("pending");
    } finally {
      await deleteNewsletterSubscriberByEmail(withTick);
      await deleteNewsletterSubscriberByEmail(withoutTick);
    }
  });
});
