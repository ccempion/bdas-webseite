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
  await page.getByLabel("Wer hat es dir empfohlen?").fill(empfehler);
  await weiter.click();

  // Step 5 — Profilbild is optional; skip it.
  await expect(page.getByRole("button", { name: /Foto hochladen/ })).toBeVisible();
  await weiter.click();

  // Step 6 — review, then submit. The action redirects to /account on success.
  await expect(page.getByText(studiengang)).toBeVisible();
  await expect(page.getByText(UNI)).toBeVisible();
  await page.getByRole("button", { name: "Absenden" }).click();
  // The action redirects to /account with the "just submitted" marker attached,
  // so match on the path rather than the whole URL.
  await page.waitForURL((u) => u.pathname.startsWith("/account"));

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

/**
 * Regression: an impatient applicant must still land on /account.
 *
 * The wizard used to navigate from a `useEffect` keyed on the action's `ok`
 * flag. That flag flips exactly once, so the effect fired exactly once — and a
 * second submit started a React transition that preempted the pending
 * navigation, stranding the applicant on /profil forever however often they
 * clicked. Production showed 17 submits and no navigation at all.
 *
 * The latency below is what makes the window observable: locally the action
 * answers in milliseconds and nobody ever gets a second click in, which is
 * exactly why the single-click spec above stayed green through the bug.
 */
test("submitting repeatedly still lands on /account", async ({ page }) => {
  // This spec deliberately spends ~20s hammering a deliberately slowed action.
  test.setTimeout(90_000);

  const groupId = await seedGroup({
    slug: uniqueSlug("e2e-profil-doppelklick"),
    name: "E2E Profil Doppelklick Gruppe",
    city: "Ungeduldstadt",
    status: "active",
  });

  const email = uniqueEmail("profil-doppelklick");
  await registerVerifyLogin(page, { email, firstName: "Ungeduldige", lastName: marker("Person-") });

  await page.goto("/profil");
  const weiter = page.getByRole("button", { name: "Weiter" });
  await page.getByLabel("Studiengang").fill(marker("Rechtswissenschaft-"));
  await page.locator("#abschlussart").selectOption("bachelor");
  await weiter.click();
  await page.locator("#uni").selectOption(UNI);
  await page.locator("#primaryGroupId").selectOption(groupId);
  await weiter.click();
  await page.getByLabel("Geburtsdatum").fill("2000-05-17");
  await weiter.click();
  // "webseite" needs no referral name, so this spec is independent of that field.
  await page.locator("#gefundenDurch").selectOption("webseite");
  await weiter.click();
  await weiter.click(); // Foto is optional

  // Stand in for a cold serverless function: both the action and the render of
  // the page it navigates to take seconds, as they do on the deployed app.
  await page.route("**/profil", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.route("**/account**", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });

  // Hammer the button the way someone does when nothing appears to happen. The
  // count and cadence are the ones production actually recorded — 17 submits
  // about 1.2s apart. Fewer clicks let the navigation win the race and the bug
  // hides. Clicks that bounce off a disabled button are the fix working.
  const absenden = page.getByRole("button", { name: "Absenden" });
  for (let i = 0; i < 15; i++) {
    if (new URL(page.url()).pathname.startsWith("/account")) break; // people stop when it works
    await absenden.click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  await page.waitForURL((u) => u.pathname.startsWith("/account"), { timeout: 20_000 });
  await expect(page.getByText("Bewerbung abgeschickt")).toBeVisible();
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

  // Nothing saved through the wizard yet, so the profile is incomplete and the
  // forms are open right away. The extended-profile form namespaces its ids
  // ("konto-") so they can't collide with the members form on this page.
  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill(studiengang);
  await form.locator("#konto-abschlussart").selectOption("master");
  await form.locator("#konto-uni").selectOption(UNI);
  await form.locator("#konto-geburtsdatum").fill("1999-01-02");
  await form.locator("#konto-gefundenDurch").selectOption("instagram");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));

  // That save stamped completed_at, so the card is now the read-only summary.
  await expect(page.getByText("Profil gespeichert.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Daten ändern" })).toBeVisible();

  // Persisted, not just echoed back into the client form.
  await page.reload();
  await page.getByRole("button", { name: "Daten ändern" }).click();
  await expect(page.locator("#konto-studiengang")).toHaveValue(studiengang);
  await expect(page.locator("#konto-abschlussart")).toHaveValue("master");
  await expect(page.locator("#konto-geburtsdatum")).toHaveValue("1999-01-02");

  // A second edit still saves (the row is upserted, not insert-once).
  const edited = marker("Maschinenbau-neu-");
  await page.locator("#konto-studiengang").fill(edited);
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));
  await page.reload();
  await page.getByRole("button", { name: "Daten ändern" }).click();
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
