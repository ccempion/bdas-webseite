/**
 * ADR 0044 — the federal board deletes a profileless applicant from
 * "Ohne Gruppe". Registration alone leaves exactly such an account (a pending
 * member row, no group, no profile), which is what a bot looks like.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail, memberIdByEmail, uniqueEmail } from "./helpers/db";
import { register, registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test("the board filters 'Ohne Profil' and deletes the bot's account", async ({ page }) => {
  const bot = uniqueEmail("pool-bot");
  const lastName = `Bot${Date.now()}`;
  try {
    await deleteUserByEmail(FEDERAL_EMAIL);
    await register(page, { email: bot, firstName: "Spam", lastName });
    await registerVerifyLogin(page, {
      email: FEDERAL_EMAIL,
      firstName: "Bundes",
      lastName: "Vorstand",
    });

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
    await expect(page.getByRole("status")).toHaveText(`Konto von S. ${lastName} gelöscht.`);
    await expect(row).toHaveCount(0);
    expect(await memberIdByEmail(bot)).toBeNull();
  } finally {
    await deleteUserByEmail(bot);
  }
});
