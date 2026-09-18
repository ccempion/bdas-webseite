/**
 * Einstiegskontext (Spec 2026-09-16 §4.1, §5.1). Projekt `onboarding`.
 */
import { expect, test } from "@playwright/test";

import { deleteUserByEmail, journeyByEmail, seedEvent, uniqueEmail } from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";
import { wizardSignup } from "./helpers/onboarding";

test("an event guest is greeted with the event", async ({ page }) => {
  const title = `E2E Sommerfest ${Date.now().toString().slice(-5)}`;
  const id = await seedEvent({
    title,
    groupId: null,
    visibility: "public",
    startsAt: new Date(Date.now() + 7 * 86_400_000),
    createdBy: "usr_e2e_seed",
  });

  await page.goto(`/mitmachen?from=event:${id}`);
  await expect(
    page.getByRole("heading", { name: new RegExp(`Du warst bei „${title}“`) }),
  ).toBeVisible();
});

test("a members-only event is not named", async ({ page }) => {
  const id = await seedEvent({
    title: "E2E Geheimtreffen",
    groupId: null,
    visibility: "members_only",
    startsAt: new Date(Date.now() + 7 * 86_400_000),
    createdBy: "usr_e2e_seed",
  });

  await page.goto(`/mitmachen?from=event:${id}`);
  await expect(page.getByRole("heading", { name: /Schön, dass du da bist!/ })).toBeVisible();
  await expect(page.getByText("E2E Geheimtreffen")).toHaveCount(0);
});

test("a campaign link stores its source", async ({ page }) => {
  const email = uniqueEmail("einstieg");
  await wizardSignup(page, {
    email,
    typ: /Ich möchte unterstützen/,
    firstName: "Kai",
    from: "kampagne:e2e-plakat",
  });
  expect(await journeyByEmail(email)).toMatchObject({ entry_source: "kampagne:e2e-plakat" });
});

test("the federal board builds a campaign link", async ({ page, context }) => {
  const federal = "federal@e2e.bdas.test";
  await deleteUserByEmail(federal);
  await registerVerifyLogin(page, { email: federal, firstName: "Bundes", lastName: "Vorstand" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/federal/einstiegslinks");
  await page.getByLabel("Kürzel der Kampagne").fill("Mensa Plakat");
  await expect(page.getByText("Nur a–z, 0–9 und Bindestrich")).toBeVisible();

  await page.getByLabel("Kürzel der Kampagne").fill("mensa-plakat");
  await expect(page.getByText(/\/mitmachen\?from=kampagne:mensa-plakat$/)).toBeVisible();
  await page.getByRole("button", { name: "Kopieren" }).click();
  await expect(page.getByRole("button", { name: "Kopiert" })).toBeVisible();
});
