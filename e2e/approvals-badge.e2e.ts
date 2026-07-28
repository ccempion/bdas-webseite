/**
 * The approval badge: a board with something to decide sees a number at its
 * name and a to-do line on /account; a plain member sees neither.
 */
import { expect, test } from "@playwright/test";

import { grantLocalBoard, memberIdByEmail, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, login, logout, registerVerifyLogin } from "./helpers/flows";

test("ein Vorstand mit offener Freigabe sieht Zahl und Hinweis", async ({ page }) => {
  const slug = uniqueSlug("badge");
  const groupId = await seedGroup({ slug, name: "Badge-Gruppe", city: "Aachen" });

  const boardEmail = uniqueEmail("board");
  await registerVerifyLogin(page, { email: boardEmail, firstName: "Bea", lastName: "Vorstand" });
  await createProfile(page, { firstName: "Bea", lastName: "Vorstand", groupId });
  await grantLocalBoard(boardEmail, groupId);
  await logout(page);

  const applicantEmail = uniqueEmail("bewerber");
  await registerVerifyLogin(page, { email: applicantEmail, firstName: "Ali", lastName: "Neu" });
  await createProfile(page, { firstName: "Ali", lastName: "Neu", groupId });
  expect(await memberIdByEmail(applicantEmail)).not.toBeNull();
  await logout(page);

  await login(page, boardEmail);
  await page.goto("/account");

  await expect(page.getByRole("status", { name: /offene Freigaben/ }).first()).toBeVisible();
  await expect(page.getByText("Es wartet etwas auf dich")).toBeVisible();
  await expect(page.getByRole("link", { name: /Mitglied\(er\) freigeben/ })).toBeVisible();
});

test("ein einfaches Mitglied sieht weder Zahl noch Hinweis", async ({ page }) => {
  const slug = uniqueSlug("kein-badge");
  const groupId = await seedGroup({ slug, name: "Ruhige Gruppe", city: "Köln" });

  const email = uniqueEmail("mitglied");
  await registerVerifyLogin(page, { email, firstName: "Mia", lastName: "Mitglied" });
  await createProfile(page, { firstName: "Mia", lastName: "Mitglied", groupId });

  await page.goto("/account");

  await expect(page.getByRole("status", { name: /offene Freigaben/ })).toHaveCount(0);
  await expect(page.getByText("Es wartet etwas auf dich")).toHaveCount(0);
});
