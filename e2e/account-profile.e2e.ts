/**
 * The /account edit gate: a member who has filled everything in reads their
 * profile as a record, and only reaches the forms through "Daten ändern".
 *
 * Requires BDAS_FLAG_PROFILE=true in the served app (playwright.config.ts
 * webServer env locally, the `e2e` job env in CI).
 */
import { expect, test, type Page } from "@playwright/test";

import { seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin, submitAndSettle } from "./helpers/flows";

// Must be an entry of UNIVERSITIES (@bdas/profile) — the select has no other values.
const UNI = "RWTH Aachen";

/** Register, join a group and fill in the extended profile, which stamps
 *  `completed_at` and so makes the profile complete. */
async function completeProfile(
  page: Page,
  opts: { email: string; groupId: string; studiengang: string },
): Promise<void> {
  await registerVerifyLogin(page, {
    email: opts.email,
    firstName: "Fertige",
    lastName: "Person",
  });
  await createProfile(page, {
    firstName: "Fertige",
    lastName: "Person",
    groupId: opts.groupId,
  });

  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill(opts.studiengang);
  await form.locator("#konto-abschlussart").selectOption("bachelor");
  await form.locator("#konto-uni").selectOption(UNI);
  await form.locator("#konto-geburtsdatum").fill("2000-03-04");
  await form.locator("#konto-gefundenDurch").selectOption("webseite");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));
}

test("a complete profile reads as a summary until Daten ändern is clicked", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-konto-gate"),
    name: "E2E Konto Gate Gruppe",
    city: "Übersichtsstadt",
    status: "active",
  });
  const studiengang = `Physik-${Math.random().toString(36).slice(2, 8)}`;

  await completeProfile(page, { email: uniqueEmail("konto-gate"), groupId, studiengang });
  await page.reload();

  // Summary: the values are on the page, in German, and no form is open.
  await expect(page.getByRole("heading", { name: "Meine Daten" })).toBeVisible();
  await expect(page.getByText(studiengang)).toBeVisible();
  await expect(page.getByText("04.03.2000")).toBeVisible();
  await expect(page.getByText("Webseite", { exact: true })).toBeVisible();
  await expect(page.locator("#konto-studiengang")).toBeHidden();
  await expect(page.locator("#firstName")).toBeHidden();

  // The gate opens both forms at once.
  await page.getByRole("button", { name: "Daten ändern" }).click();
  await expect(page.locator("#firstName")).toBeVisible();
  await expect(page.locator("#konto-studiengang")).toHaveValue(studiengang);

  // Only the members form owns the group — the extended form no longer
  // duplicates the select.
  await expect(page.locator("#primaryGroupId")).toBeVisible();
  await expect(page.locator("#konto-primaryGroupId")).toHaveCount(0);

  // Abbrechen goes back without writing anything.
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.locator("#konto-studiengang")).toBeHidden();
  await expect(page.getByRole("button", { name: "Daten ändern" })).toBeVisible();
});

test("saving from the edit view returns to the summary with the new value", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-konto-save"),
    name: "E2E Konto Save Gruppe",
    city: "Speicherstadt",
    status: "active",
  });
  const studiengang = `Chemie-${Math.random().toString(36).slice(2, 8)}`;

  await completeProfile(page, { email: uniqueEmail("konto-save"), groupId, studiengang });
  await page.reload();

  const edited = `${studiengang}-neu`;
  await page.getByRole("button", { name: "Daten ändern" }).click();
  await page.locator("#konto-studiengang").fill(edited);
  await submitAndSettle(
    page,
    page.locator("form:has(#konto-studiengang)").getByRole("button", { name: "Speichern" }),
  );

  await expect(page.getByText("Profil gespeichert.")).toBeVisible();
  await expect(page.locator("#konto-studiengang")).toBeHidden();
  await expect(page.getByText(edited)).toBeVisible();

  // Persisted, not just held in client state.
  await page.reload();
  await expect(page.getByText(edited)).toBeVisible();
});

test("an unfinished profile still shows the forms directly", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-konto-offen"),
    name: "E2E Konto Offen Gruppe",
    city: "Anfangsstadt",
    status: "active",
  });

  await registerVerifyLogin(page, {
    email: uniqueEmail("konto-offen"),
    firstName: "Halbe",
    lastName: "Person",
  });
  await createProfile(page, { firstName: "Halbe", lastName: "Person", groupId });

  // Name and group are set but the extended fields are not, so nothing is
  // gated: no "Daten ändern", both forms open.
  await expect(page.getByRole("button", { name: "Daten ändern" })).toHaveCount(0);
  await expect(page.locator("#firstName")).toBeVisible();
  await expect(page.locator("#konto-studiengang")).toBeVisible();
});
