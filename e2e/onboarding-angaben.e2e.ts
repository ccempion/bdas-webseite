/**
 * Onboarding-Wizard, Teil 3 und Anträge (Spec 2026-09-16 §4.3, §5.2, §5.3, §7).
 * Projekt `onboarding` (Port 3001, Flag an).
 */
import { expect, test, type Page } from "@playwright/test";

import {
  deleteUserByEmail,
  ensureNetzwerkGroup,
  journeyByEmail,
  openRequestTargetByEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import {
  login,
  pickCombo,
  registerVerifyLogin,
  verify,
  verifyTokenFromBrowser,
} from "./helpers/flows";
import { wizardSignup } from "./helpers/onboarding";

// Must match BDAS_FEDERAL_BOARD_EMAILS in the CI e2e job.
const FEDERAL_EMAIL = "federal@e2e.bdas.test";
const UNI = "RWTH Aachen";

const weiter = (page: Page) => page.getByRole("button", { name: "Weiter" }).click();

test("student: confirm, sign in, details, application to the group", async ({ page }) => {
  const city = `Angstadt${Math.random().toString(36).slice(2, 7)}`;
  const groupId = await seedGroup({ slug: uniqueSlug("e2e-ang"), name: `BDAS ${city}`, city });
  const email = uniqueEmail("ang-student");

  await wizardSignup(page, { email, typ: /Ich studiere gerade/, firstName: "Lea", place: city });
  await verify(page);
  await login(page, email, undefined, { expect: "mitmachen" });

  await expect(page).toHaveURL(/\/mitmachen\/angaben$/);
  await expect(page.getByText("Willkommen zurück, Lea — fast geschafft.")).toBeVisible();

  await pickCombo(page, "studienfachKategorie", "Ingenieurwissenschaften");
  await pickCombo(page, "studiengang", "Maschinenbau/-wesen");
  await page.locator("#abschlussart").selectOption("bachelor");
  await weiter(page);
  await pickCombo(page, "uni", UNI);
  await weiter(page);
  await page.getByLabel("Geburtsdatum").fill("2002-03-04");
  await weiter(page);
  await page.locator("#gefundenDurch").selectOption("webseite");
  await weiter(page);
  await weiter(page); // Foto ist freiwillig

  await expect(page.getByRole("heading", { name: "Passt alles?" })).toBeVisible();
  await expect(page.getByText("Ingenieurwissenschaften · Maschinenbau/-wesen")).toBeVisible();
  await page.getByRole("button", { name: "Bewerbung abschicken" }).click();

  await expect(page).toHaveURL(/\/mitmachen\/fertig$/);
  await expect(
    page.getByRole("heading", { name: `Deine Bewerbung liegt jetzt bei BDAS ${city}.` }),
  ).toBeVisible();
  expect(await openRequestTargetByEmail(email)).toBe(groupId);
  expect(await journeyByEmail(email)).toMatchObject({ status: "abgeschickt" });
});

test("alumnus: confirm in a fresh browser, no request, the federal board sees the intent", async ({
  page,
  browser,
}) => {
  const email = uniqueEmail("ang-alumnus");
  await wizardSignup(page, { email, typ: /Ich habe studiert/, firstName: "Kim", skipPlace: true });

  // Der Token gehört zum ersten Browser; ein anderes Gerät bekommt ihn per Mail,
  // bestätigt damit und meldet sich dort normal an (ADR 0051).
  const token = await verifyTokenFromBrowser(page);
  const other = await browser.newContext({ baseURL: "http://localhost:3001" });
  const phone = await other.newPage();
  await verify(phone, { token });
  await login(phone, email, undefined, { expect: "mitmachen" });
  await expect(phone.getByRole("heading", { name: "Was hast du studiert?" })).toBeVisible();

  await pickCombo(phone, "studienfachKategorie", "Rechts- und Verwaltungswissenschaften");
  await pickCombo(phone, "studiengang", "Rechtswissenschaft");
  await weiter(phone);
  await pickCombo(phone, "uni", UNI);
  await weiter(phone);
  await phone.locator("#gefundenDurch").selectOption("instagram");
  await weiter(phone);
  await phone.getByRole("button", { name: "Bewerbung abschicken" }).click();
  await expect(
    phone.getByRole("heading", { name: "Deine Bewerbung liegt jetzt beim Bundesvorstand." }),
  ).toBeVisible();
  await other.close();

  expect(await openRequestTargetByEmail(email)).toBeNull();

  await deleteUserByEmail(FEDERAL_EMAIL);
  await registerVerifyLogin(page, {
    email: FEDERAL_EMAIL,
    firstName: "Bundes",
    lastName: "Vorstand",
  });
  await page.goto("/federal/pool");
  await expect(page.getByRole("row", { name: /K\. E2E/ }).first()).toContainText(
    "Bewirbt sich als Alumna/Alumnus",
  );
});

test("supporter: interest, application to the netzwerk group", async ({ page }) => {
  const netzwerk = await ensureNetzwerkGroup();
  const email = uniqueEmail("ang-foerderer");

  await wizardSignup(page, { email, typ: /Ich möchte unterstützen/, firstName: "Ada" });
  await verify(page);
  await login(page, email, undefined, { expect: "mitmachen" });

  await page.locator("#interesse").fill("Kulturarbeit und Seminare");
  await weiter(page);
  await page.locator("#gefundenDurch").selectOption("webseite");
  await weiter(page);
  await page.getByRole("button", { name: "Bewerbung abschicken" }).click();

  await expect(page).toHaveURL(/\/mitmachen\/fertig$/);
  expect(await openRequestTargetByEmail(email)).toBe(netzwerk);
});

test("an account from the old registration continues after the name", async ({ page }) => {
  const email = uniqueEmail("ang-alt");
  await registerVerifyLogin(page, { email, firstName: "Alt", lastName: "Konto" });

  await expect(page).toHaveURL(/\/mitmachen$/);
  await page.getByRole("button", { name: /Ich möchte unterstützen/ }).click();
  // Der Name steht fest; die Frage wird übersprungen.
  await expect(page.getByLabel("Vorname")).toHaveCount(0);
  await page.getByRole("button", { name: "Passt — weiter" }).click();
  await expect(page).toHaveURL(/\/mitmachen\/angaben$/);
});

test("der Bestätigungslink meldet direkt an", async ({ page }) => {
  const city = `Direktstadt${Math.random().toString(36).slice(2, 7)}`;
  await seedGroup({ slug: uniqueSlug("e2e-dir"), name: `BDAS ${city}`, city });
  const email = uniqueEmail("ang-direkt");

  await wizardSignup(page, { email, typ: /Ich studiere gerade/, firstName: "Deniz", place: city });
  await verify(page);

  await expect(page).toHaveURL(/\/mitmachen\/angaben$/);
  await expect(page.getByText("Willkommen zurück, Deniz — fast geschafft.")).toBeVisible();
});
