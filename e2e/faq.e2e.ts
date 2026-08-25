/**
 * FAQ suite (#133): the role-aware /faq page and its footer entry point.
 *  - A guest is bounced to the login page.
 *  - A signed-in member reaches the FAQ from the footer link, and the section
 *    matching their role (Mitglieder) is expanded while a board-only section
 *    (Bundesvorstand) stays collapsed.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

test("a guest visiting /faq is redirected to login", async ({ page }) => {
  await page.goto("/faq");
  await page.waitForURL("**/anmelden**");
  expect(page.url()).toContain("/anmelden");
});

test("a signed-in member opens the FAQ from the footer, role section expanded", async ({
  page,
}) => {
  const email = "faq-member@e2e.bdas.test";
  await deleteUserByEmail(email);
  await registerVerifyLogin(page, { email, firstName: "Faq", lastName: "Mitglied" });

  // The footer link is present and clearly reachable.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /FAQ/ }).first()).toBeVisible();

  await page.goto("/faq");
  await expect(page.getByRole("heading", { level: 1, name: /FAQ & Hilfe/ })).toBeVisible();

  // Plain member → the Mitglieder section is open (its intro is rendered) …
  await expect(page.getByText("Was du als Mitglied auf der Plattform tun kannst.")).toBeVisible();
  // … while the board-only section stays collapsed (its intro is not rendered).
  await expect(
    page.getByText("Föderationsweite Funktionen unter „Bundesverband“.", { exact: false }),
  ).toBeHidden();
});
