/**
 * Onboarding-Wizard, Teil 1 und 2 (Spec 2026-09-16 §4.1, §4.2, §5.5, §7).
 * Läuft im Projekt `onboarding` gegen den Server mit BDAS_FLAG_ONBOARDING.
 */
import { expect, test, type Page } from "@playwright/test";

import { journeyByEmail, resetRateLimits, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { openMobileMenu, PASSWORD } from "./helpers/flows";

function uniqueCity(): string {
  return `Onbstadt${Math.random().toString(36).slice(2, 7)}`;
}

async function answerName(page: Page, first: string, last: string): Promise<void> {
  await page.getByLabel("Vorname").fill(first);
  await page.getByLabel("Nachname").fill(last);
  await page.getByRole("button", { name: "Weiter" }).click();
}

async function createAccount(page: Page, email: string): Promise<void> {
  await resetRateLimits();
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(
    page.getByRole("heading", { name: "Wir haben dir eine Mail geschickt" }),
  ).toBeVisible();
}

test("the window opens from the header and closes again", async ({ page }) => {
  await page.goto("/");
  await openMobileMenu(page);
  await page.getByRole("banner").locator('a[href="/mitmachen"]:visible').first().click();

  const dialog = page.getByRole("dialog", { name: "Mitglied werden" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/mitmachen$/);
  await expect(
    dialog.getByRole("heading", { name: /Was beschreibt dich am besten\?/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("a direct link renders the full page", async ({ page }) => {
  await page.goto("/mitmachen");
  await expect(page.getByRole("heading", { level: 1, name: "Mitglied werden" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("student with a group: questions, result, account, mail", async ({ page }) => {
  const city = uniqueCity();
  await seedGroup({ slug: uniqueSlug("e2e-onb"), name: `BDAS ${city}`, city, status: "active" });
  const email = uniqueEmail("onb-student");

  await page.goto("/mitmachen?from=kampagne:e2e");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Lea", "Test");

  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await page
    .getByRole("button", { name: new RegExp(`BDAS ${city}`) })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: `Du wärst als Student*in bei BDAS ${city} angemeldet.` }),
  ).toBeVisible();
  await expect(page.getByText(`Der Vorstand von BDAS ${city}`)).toBeVisible();
  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);

  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "student",
    status: "details_offen",
    entry_source: "kampagne:e2e",
    stadt: city,
    application_ref: null,
  });
});

test("student without a group lands with the federal board", async ({ page }) => {
  const city = uniqueCity();
  const email = uniqueEmail("onb-ohne");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Mo", "Test");
  await page.getByLabel("Stadt oder Hochschule").fill(city);
  await expect(page.getByText(`In ${city} finden wir keine Gruppe`)).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();

  // Ohne Gruppe vor Ort fragt der Ablauf nach der Absicht (ADR 0050).
  await expect(
    page.getByRole("heading", { name: new RegExp(`In ${city} gibt es noch kein BDAS`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Erst mal einfach dabei sein" }).click();

  await expect(
    page.getByRole("heading", { name: new RegExp(`auch ohne Gruppe vor Ort`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);

  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "student_ohne_gruppe",
    stadt: city,
  });
});

test("supporter changes their mind and back, keeping the name", async ({ page }) => {
  const email = uniqueEmail("onb-foerderer");

  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich möchte unterstützen/ }).click();
  await answerName(page, "Ada", "Test");
  await expect(
    page.getByRole("heading", { name: "Du wärst als Förderer*in angemeldet." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Doch etwas anderes" }).click();
  await page.getByRole("button", { name: /Ich möchte unterstützen/ }).click();
  await expect(page.getByLabel("Vorname")).toHaveValue("Ada");
  await page.getByRole("button", { name: "Weiter" }).click();

  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await createAccount(page, email);
  expect(await journeyByEmail(email)).toMatchObject({
    outcome: "foerderer",
    entry_source: "direkt",
  });
});

test("answers survive a reload", async ({ page }) => {
  await page.goto("/mitmachen");
  await page.getByRole("button", { name: /Ich studiere gerade/ }).click();
  await answerName(page, "Lea", "Test");
  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Wo studierst du, Lea?" })).toBeVisible();
});

test("the whole first part works with the keyboard alone", async ({ page }) => {
  await page.goto("/mitmachen");
  const card = page.getByRole("button", { name: /Ich habe studiert/ });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Wie dürfen wir dich nennen?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.type("Kim");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Test");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Wo warst du aktiv, Kim?" })).toBeFocused();
});
