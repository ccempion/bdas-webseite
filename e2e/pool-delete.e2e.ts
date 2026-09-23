/**
 * ADR 0044 — the federal board deletes a profileless applicant from
 * "Ohne Gruppe". Registration alone leaves exactly such an account (a pending
 * member row, no group, no profile), which is what a bot looks like.
 */
import { expect, test } from "@playwright/test";

import {
  declineNewsletterPromptByEmail,
  deleteUserByEmail,
  memberIdByEmail,
  uniqueEmail,
} from "./helpers/db";
import { register } from "./helpers/flows";
import { seedSession } from "./helpers/session";

// Fixed so the account can be deleted and recreated across retries; the
// `federal_board` role goes straight into the seeded token (see helpers/session.ts).
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test("the board filters 'Ohne Profil' and deletes the bot's account", async ({ page }) => {
  const bot = uniqueEmail("pool-bot");
  const lastName = `Bot${Date.now()}`;
  try {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await register(page, { email: bot, firstName: "Spam", lastName });
    await seedSession(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
      roles: ["federal_board"],
    });
    // Once the pool table has accumulated enough rows across the suite,
    // scrolling the delete button into view can cross NewsletterScrollPanel's
    // trigger depth, and the panel slides in over the button mid-click.
    // Answer its own server-side gate (shouldPrompt) up front so it is never
    // eligible to mount at all, rather than reacting to it mid-retry.
    await declineNewsletterPromptByEmail(FEDERAL_EMAIL);

    await page.goto("/federal/pool");
    await page.getByRole("button", { name: "Ohne Profil", exact: true }).click();
    const row = page.getByRole("row", { name: new RegExp(`S\\. ${lastName}`) });
    await expect(row).toBeVisible();

    // The board's own account sits in the same list and must not be deletable.
    await expect(
      page.getByRole("row", { name: /B\. Vorstand/ }).getByRole("button", { name: "Löschen" }),
    ).toHaveCount(0);

    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Löschen" }).click();
    // Scoped to the notice <p>: the sidebar's own-count Badge is also
    // role="status" (a <span>) and collides once other specs have left
    // pending approvals behind, tripping Playwright's strict mode.
    await expect(page.locator('p[role="status"]')).toHaveText(`Konto von S. ${lastName} gelöscht.`);
    await expect(row).toHaveCount(0);
    expect(await memberIdByEmail(bot)).toBeNull();
  } finally {
    await deleteUserByEmail(bot);
  }
});
