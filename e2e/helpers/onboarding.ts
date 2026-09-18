import { expect, type Page } from "@playwright/test";

import { resetRateLimits } from "./db";
import { PASSWORD } from "./flows";

/** Teil 1 und 2 des Wizards bis „Mail geschickt". */
export async function wizardSignup(
  page: Page,
  opts: { email: string; typ: RegExp; firstName: string; place?: string; skipPlace?: boolean },
): Promise<void> {
  await resetRateLimits();
  await page.goto("/mitmachen");
  await page.getByRole("button", { name: opts.typ }).click();
  await page.getByLabel("Vorname").fill(opts.firstName);
  await page.getByLabel("Nachname").fill("E2E");
  await page.getByRole("button", { name: "Weiter" }).click();

  if (opts.skipPlace) {
    await page.getByRole("button", { name: "Überspringen" }).click();
  } else if (opts.place) {
    await page.getByLabel("Stadt oder Hochschule").fill(opts.place);
    await page
      .getByRole("button", { name: new RegExp(`BDAS ${opts.place}`) })
      .first()
      .click();
  }

  await page.getByRole("button", { name: "Passt — Konto anlegen" }).click();
  await page.getByLabel("E-Mail", { exact: true }).fill(opts.email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: "Konto erstellen" }).click();
  await expect(
    page.getByRole("heading", { name: "Wir haben dir eine Mail geschickt" }),
  ).toBeVisible();
}
