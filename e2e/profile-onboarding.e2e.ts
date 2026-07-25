/**
 * Profile onboarding (Issues #52 / #96 / #97), spec §12.
 *
 * Covers the flag-on flow end to end: register → verify → the wizard → submit →
 * the local board sees the application with the referral name; the /account edit
 * path (#96); and the anonymous gates on the wizard and the upload endpoint.
 *
 * Requires BDAS_FLAG_PROFILE=true in the served app (playwright.config.ts
 * webServer env locally, the `e2e` job env in CI).
 */
import { expect, test } from "@playwright/test";

import { grantLocalBoard, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import {
  createProfile,
  login,
  logout,
  PASSWORD,
  register,
  registerVerifyLogin,
  submitAndSettle,
  verify,
} from "./helpers/flows";

// Must be an entry of UNIVERSITIES (@bdas/profile) — the select has no other values.
const UNI = "RWTH Aachen";

/** Unique per run so a shared DB never makes an assertion ambiguous. */
function marker(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

test("register → verify → wizard → the local board sees the application", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-profil"),
    name: "E2E Profil Gruppe",
    city: "Profilstadt",
    status: "active",
  });

  const email = uniqueEmail("profil");
  const lastName = marker("Bewerb");
  const studiengang = marker("Wirtschaftsinformatik-");
  const empfehler = marker("Empfehlerin-");

  await register(page, { email, firstName: "Neue", lastName });
  await verify(page, email);
  // Verifying happens without a session: the wizard redirect lands on sign-in.
  await expect(page).toHaveURL(/\/anmelden/);

  // Pending member, profile unfinished → sign-in routes into the wizard.
  await login(page, email, PASSWORD, { expect: "profil" });
  await expect(page.getByRole("heading", { name: "Profil vervollständigen" })).toBeVisible();

  const weiter = page.getByRole("button", { name: "Weiter" });

  // Step 1 — Studium.
  await page.getByLabel("Studiengang").fill(studiengang);
  await page.locator("#abschlussart").selectOption("bachelor");
  await weiter.click();

  // Step 2 — Hochschule & Gruppe.
  await page.locator("#uni").selectOption(UNI);
  await page.locator("#primaryGroupId").selectOption(groupId);
  await weiter.click();

  // Step 3 — Geburtsdatum.
  await page.getByLabel("Geburtsdatum").fill("2000-05-17");
  await weiter.click();

  // Step 4 — a referral carries the referrer's name through to the board.
  await page.locator("#gefundenDurch").selectOption("empfehlung");
  await page.getByLabel("Von wem wurdest du empfohlen?").fill(empfehler);
  await weiter.click();

  // Step 5 — Profilbild is optional; skip it.
  await expect(page.getByRole("button", { name: /Foto hochladen/ })).toBeVisible();
  await weiter.click();

  // Step 6 — review, then submit. The action redirects to /account on success.
  await expect(page.getByText(studiengang)).toBeVisible();
  await expect(page.getByText(UNI)).toBeVisible();
  await page.getByRole("button", { name: "Absenden" }).click();
  await page.waitForURL("**/account");

  // A completed profile no longer routes to the wizard — it redirects away.
  await page.goto("/profil");
  await expect(page).toHaveURL(/\/account/);
  await logout(page);

  // A local board member of the same group reviews the application.
  const boardEmail = uniqueEmail("profil-vorstand");
  await registerVerifyLogin(page, { email: boardEmail });
  await createProfile(page, { firstName: "Lokal", lastName: "Vorstand" });
  await grantLocalBoard(boardEmail, groupId); // DB-read grants: live next request

  await page.goto("/admin/pending-members");
  const row = page.locator("li", { hasText: lastName });
  await expect(row).toBeVisible();
  await expect(row.getByText(studiengang)).toBeVisible();
  await expect(row.getByText(UNI)).toBeVisible();
  await expect(row.getByText("Bachelor")).toBeVisible();
  // "Empfehlung (<name>)" — the referral is a board signal, nothing automatic.
  await expect(row.getByText(empfehler)).toBeVisible();
});

test("a member edits their extended profile on Mein Konto", async ({ page }) => {
  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-profil-edit"),
    name: "E2E Profil Edit Gruppe",
    city: "Änderungsstadt",
    status: "active",
  });

  const email = uniqueEmail("profil-edit");
  await registerVerifyLogin(page, { email, firstName: "Ändernde", lastName: "Person" });
  await createProfile(page, { firstName: "Ändernde", lastName: "Person", groupId });

  const studiengang = marker("Maschinenbau-");
  await page.goto("/account");

  // The extended-profile form namespaces its ids ("konto-") so they can't
  // collide with the members form's own primaryGroupId select on this page.
  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill(studiengang);
  await form.locator("#konto-abschlussart").selectOption("master");
  await form.locator("#konto-uni").selectOption(UNI);
  await form.locator("#konto-primaryGroupId").selectOption(groupId);
  await form.locator("#konto-geburtsdatum").fill("1999-01-02");
  await form.locator("#konto-gefundenDurch").selectOption("instagram");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Profil gespeichert.")).toBeVisible();

  // Persisted, not just echoed back into the client form.
  await page.reload();
  await expect(page.locator("#konto-studiengang")).toHaveValue(studiengang);
  await expect(page.locator("#konto-abschlussart")).toHaveValue("master");
  await expect(page.locator("#konto-geburtsdatum")).toHaveValue("1999-01-02");

  // A second edit still saves (the row is upserted, not insert-once).
  const edited = marker("Maschinenbau-neu-");
  await page.locator("#konto-studiengang").fill(edited);
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));
  await page.reload();
  await expect(page.locator("#konto-studiengang")).toHaveValue(edited);
});

test("the wizard and the upload endpoint reject anonymous callers", async ({ page }) => {
  await page.goto("/profil");
  await expect(page).toHaveURL(/\/anmelden/);

  const res = await page.request.post("/api/profile/upload-url", {
    data: { filename: "x.jpg", mimeType: "image/jpeg", sizeBytes: 1024 },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);
});
