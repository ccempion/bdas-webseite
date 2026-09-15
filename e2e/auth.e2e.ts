/**
 * §23 — "a new visitor can register, verify email, log in, log out, reset password."
 * Drives the real UI; the one-time tokens are read from the DB (the app would
 * normally email them).
 */
import { expect, test } from "@playwright/test";

import {
  latestResetToken,
  resetRateLimits,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import {
  createProfile,
  login,
  logout,
  openMobileMenu,
  pickCombo,
  PASSWORD,
  register,
  registerVerifyLogin,
  submitAndSettle,
  verify,
} from "./helpers/flows";

test("register → verify → login → logout → reset → re-login", async ({ page }) => {
  const email = uniqueEmail("auth");

  await register(page, { email });
  await expect(page.getByText(/Spam-Ordner/)).toBeVisible();

  await verify(page, email);

  // With the `profile` flag on, sign-in routes a pending member with an
  // unfinished profile to the wizard (anmelden/actions.ts) — this spec is about
  // the session, so go to /account explicitly rather than assume the landing.
  await login(page, email);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();

  // The global header (role=banner) must reflect the session, and must survive a
  // reload of a public page — the reported "logged out on reload" symptom. This
  // suite runs a mobile viewport, so the header's controls live behind the
  // "Menü" disclosure, which resets closed on every navigation/reload.
  const banner = page.getByRole("banner");
  await openMobileMenu(page);
  await expect(banner.getByRole("link", { name: "Mein Konto" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await page.goto("/");
  await page.reload();
  await openMobileMenu(page);
  await expect(banner.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await expect(banner.getByRole("link", { name: "Anmelden" })).toHaveCount(0);

  await logout(page);
  await expect(page).not.toHaveURL(/\/account/);
  await openMobileMenu(page);
  await expect(banner.getByRole("link", { name: "Anmelden" })).toBeVisible();

  // Request a password reset, then complete it with the DB-read token.
  await resetRateLimits();
  await page.goto("/passwort-zuruecksetzen");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Link senden" }).click();

  // The reset token is written by the Server Action; poll to avoid a race.
  let token: string | null = null;
  await expect(async () => {
    token = await latestResetToken(email);
    expect(token, `reset token for ${email}`).toBeTruthy();
  }).toPass({ timeout: 10_000 });

  const newPassword = `${PASSWORD}-neu`;
  await page.goto(`/passwort-zuruecksetzen/${token}`);
  await page.getByLabel("Neues Passwort").fill(newPassword);
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  // completeResetAction redirects to /anmelden only on success — confirms done.
  await page.waitForURL("**/anmelden");

  // The old password must no longer work; the new one must.
  await login(page, email, newPassword);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});

/**
 * ADR 0034 moved e-mail, password and data export off /account onto a sub-page.
 * This pins the route the member takes to reach them, in both directions.
 */
test("a member reaches account settings from Mein Konto", async ({ page }) => {
  const email = uniqueEmail("settings");
  await registerVerifyLogin(page, { email });

  await page.goto("/account");
  await page.getByRole("link", { name: "Kontoeinstellungen" }).click();

  await expect(page).toHaveURL(/\/account\/einstellungen/);
  await expect(page.getByRole("heading", { name: "Kontoeinstellungen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E-Mail-Adresse" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Passwort", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deine Daten" })).toBeVisible();

  await page.getByRole("link", { name: "← Mein Konto" }).click();
  await expect(page.getByRole("heading", { name: "Mein Konto" })).toBeVisible();
});

/**
 * Issue #54: a not-logged-in visit to a protected page must not lose the
 * destination — login should land back on it, not always on the home page.
 * Uses /account/einstellungen as the protected target; the profile must be
 * complete first, since an incomplete pending profile forces a `/profil`
 * landing regardless of `returnTo` (loginAction's onboarding branch — see
 * apps/web/app/anmelden/actions.ts).
 */
test("logging in from a protected-page redirect lands back on that page", async ({ page }) => {
  const email = uniqueEmail("returnto");
  const groupId = await seedGroup({
    slug: uniqueSlug("returnto"),
    name: "Returnto Test Gruppe",
    city: "Teststadt",
  });

  await registerVerifyLogin(page, { email, firstName: "Return", lastName: "To" });
  await createProfile(page, { firstName: "Return", lastName: "To", groupId });

  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill("Informatik");
  await form.locator("#konto-abschlussart").selectOption("bachelor");
  await pickCombo(form, "konto-uni", "RWTH Aachen");
  await form.locator("#konto-geburtsdatum").fill("2000-03-04");
  await form.locator("#konto-gefundenDurch").selectOption("webseite");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));

  await logout(page);

  // Visiting the protected page while logged out must bounce through
  // /anmelden carrying the originally requested path.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden\?returnTo=%2Faccount%2Feinstellungen/);

  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // Lands back on /account/einstellungen, not on the home page.
  await page.waitForURL("**/account/einstellungen");
  await expect(page.getByRole("heading", { name: "Kontoeinstellungen" })).toBeVisible();
});

/**
 * The open-redirect guard: a crafted returnTo pointing off-site must never be
 * honored. sanitizeReturnTo's unit tests (apps/web/app/_auth/return-to.test.ts)
 * cover the sanitizer exhaustively; this pins the integration once — login
 * with a scheme-qualified returnTo still lands on the safe default.
 */
test("a scheme-qualified returnTo is ignored, not followed", async ({ page }) => {
  const email = uniqueEmail("openredirect");
  const groupId = await seedGroup({
    slug: uniqueSlug("openredirect"),
    name: "Openredirect Test Gruppe",
    city: "Teststadt",
  });

  await registerVerifyLogin(page, { email, firstName: "Open", lastName: "Redirect" });
  await createProfile(page, { firstName: "Open", lastName: "Redirect", groupId });

  const form = page.locator("form:has(#konto-studiengang)");
  await form.locator("#konto-studiengang").fill("Informatik");
  await form.locator("#konto-abschlussart").selectOption("bachelor");
  await pickCombo(form, "konto-uni", "RWTH Aachen");
  await form.locator("#konto-geburtsdatum").fill("2000-03-04");
  await form.locator("#konto-gefundenDurch").selectOption("webseite");
  await submitAndSettle(page, form.getByRole("button", { name: "Speichern" }));

  await logout(page);

  await page.goto("/anmelden?returnTo=" + encodeURIComponent("https://evil.example"));
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();

  // The malicious returnTo is stripped server-side before the redirect is
  // issued, so this never becomes a real cross-origin navigation — it lands
  // on the safe default (home page), not evil.example.
  await page.waitForURL((url) => url.pathname === "/");
  expect(new URL(page.url()).hostname).not.toBe("evil.example");
});
