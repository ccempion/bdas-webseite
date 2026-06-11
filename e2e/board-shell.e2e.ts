/**
 * Board shell smoke tests (Phase 3 PR 2).
 *
 * Requires BDAS_FLAG_DASHBOARD=true in the e2e env (set it alongside the other
 * flags in the e2e setup, mirroring how auth/members flags are enabled).
 *
 * The anonymous-redirect test requires no seeded user.
 * The non-board-member redirect test seeds a plain member via the same
 * registerVerifyLogin + createProfile helpers used by auth.e2e.ts and board.e2e.ts.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail, uniqueEmail } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

test.describe("board shell", () => {
  test("anonymous visitor to /federal/overview is redirected to /anmelden", async ({ page }) => {
    await page.goto("/federal/overview");
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("a non-board member visiting the cockpit is redirected to /account", async ({ page }) => {
    const email = uniqueEmail("plain-member");
    await deleteUserByEmail(email);
    await registerVerifyLogin(page, { email, firstName: "Plain", lastName: "Member" });
    await createProfile(page, { firstName: "Plain", lastName: "Member" });

    // A plain pending/active member has no board grant; should be redirected.
    await page.goto("/federal/overview");
    await expect(page).toHaveURL(/\/account/);
  });
});
