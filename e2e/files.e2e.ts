/**
 * Files write experience smoke (PR 3): a federal board member opens a folder
 * and uploads a file, which then appears in the list.
 *
 * Skipped unless BDAS_FLAG_FILES=true, because the upload path needs the files
 * surface enabled AND reachable object storage (the browser PUTs bytes straight
 * to a signed Supabase URL). The current CI e2e job runs without files storage,
 * so this self-skips there; it runs wherever the flag + storage are provisioned.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the e2e environment.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test.skip(
  process.env["BDAS_FLAG_FILES"] !== "true",
  "files surface + object storage not enabled in this e2e environment",
);

test("a federal board member uploads a file into a folder", async ({ page }) => {
  const filename = `e2e-upload-${Date.now().toString().slice(-6)}.txt`;

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  // A member profile is required to act in the files service.
  await createProfile(page, { firstName: "Bundes", lastName: "Vorstand" });

  // Open the first folder the federal board can reach.
  await page.goto("/federal/files");
  await page.getByRole("link").filter({ hasText: "›" }).first().click();
  await page.waitForURL("**/federal/files/**");

  // The dropzone's file input is hidden; setInputFiles targets it directly.
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "text/plain",
    buffer: Buffer.from("e2e upload smoke"),
  });

  // The uploaded file appears (uploader row reaches "Fertig"; list refreshes).
  await expect(page.getByText(filename).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Fertig")).toBeVisible({ timeout: 15_000 });
});
