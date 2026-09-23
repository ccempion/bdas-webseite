/**
 * §23 board flows:
 *  - "a federal board member can create a new group, edit it, and archive it."
 *  - "a local board member can … approve a pending member."
 *
 * Federal access comes from the JWT: the login service adds `federal_board`
 * when the email is in BDAS_FEDERAL_BOARD_EMAILS (login.ts). The CI `e2e` job
 * sets that env to FEDERAL_EMAIL below.
 */
import { expect, test } from "@playwright/test";

import {
  deleteUserByEmail,
  grantLocalBoardLead,
  memberStatusByEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { endSession, seedSession } from "./helpers/session";

// Fixed so the account can be deleted and recreated across retries. The
// `federal_board` role is put straight into the seeded token — the same place
// login.ts puts it for an address in BDAS_FEDERAL_BOARD_EMAILS; that derivation
// itself is covered by onboarding-einstieg.e2e.ts, which signs in for real.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";

test("federal board can create, edit, and archive a group", async ({ page }) => {
  // Idempotent across retries (fixed email in a shared DB).
  await deleteUserByEmail(FEDERAL_EMAIL);
  await seedSession(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
    roles: ["federal_board"],
  });

  const slug = uniqueSlug("e2e-board");
  const name = "E2E Board Gruppe";

  // Create (active) — /admin/gruppen is gone (#62); creation lives on the
  // federal board scope and takes name/city/slug only.
  await page.goto("/federal/groups");
  await page.getByRole("button", { name: "+ Gruppe anlegen" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Stadt").fill("Boardstadt");
  await page.getByLabel("Slug").fill(slug);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("cell", { name })).toBeVisible();

  // It is now public.
  await page.goto("/gruppen");
  await expect(page.getByText(name)).toBeVisible();

  // Edit the name on the group's own profile page (federal passes the lead gate).
  const edited = `${name} (bearbeitet)`;
  await page.goto(`/gruppe/${slug}/profil`);
  await page.getByLabel("Name").fill(edited);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  await page.goto("/gruppen");
  await expect(page.getByText(edited)).toBeVisible();

  // Archive from the federal groups table.
  await page.goto("/federal/groups");
  await page
    .getByRole("row", { name: new RegExp(edited.replace(/[()]/g, "\\$&")) })
    .getByRole("button", { name: "Archivieren" })
    .click();
  await expect(async () => {
    await page.goto("/gruppen");
    await expect(page.getByText(edited)).toHaveCount(0);
  }).toPass();
});

test("a local board member can approve a pending member of their group", async ({ page }) => {
  const groupSlug = uniqueSlug("e2e-approve");
  const groupId = await seedGroup({
    slug: groupSlug,
    name: "E2E Approve Gruppe",
    city: "Freigabestadt",
    status: "active",
  });

  // An applicant who picked this group. Since ADR 0031 that files a request
  // rather than writing the column, so they stay groupless until the board acts.
  const pendingEmail = uniqueEmail("pending");
  const pendingLast = `P${Date.now().toString().slice(-6)}`;
  await seedSession(page, {
    email: pendingEmail,
    firstName: "Wartend",
    lastName: pendingLast,
    application: groupId,
  });
  await endSession(page);

  // A local_board member of the same group.
  const localEmail = uniqueEmail("local");
  await seedSession(page, { email: localEmail, firstName: "Lokal", lastName: "Vorstand" });
  await grantLocalBoardLead(localEmail, groupId); // takes effect on next request (DB-read grants)

  // Accept the applicant from the group's queue.
  await page.goto(`/gruppe/${groupSlug}/bewerbungen`);
  const card = page.locator("main > div", { hasText: pendingLast });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Aufnehmen" }).click();

  await expect(async () => {
    expect(await memberStatusByEmail(pendingEmail)).toBe("active");
  }).toPass();
});
