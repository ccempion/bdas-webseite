/**
 * The brand loader during navigation.
 *
 * It cannot come from a root `loading.tsx` — that Suspense boundary makes Next
 * commit a 200 status before a page can call `notFound()` (8ac77f6), and the
 * 404 assertions in content-pages/group-pages guard that. This suite guards the
 * other half: that removing the boundary did not also remove the loader.
 */
import { expect, test } from "@playwright/test";

const LOADER = { role: "status" as const, name: "Wird geladen" };

test("the brand loader appears during a navigation and clears on arrival", async ({ page }) => {
  await page.goto("/");

  // Locally the route resolves faster than the 150ms display threshold, so the
  // indicator would correctly never show. Hold the response long enough to see it.
  await page.route("**/impressum**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });

  await page.getByRole("contentinfo").getByRole("link", { name: "Impressum" }).click();
  await expect(page.getByRole(LOADER.role, { name: LOADER.name })).toBeVisible();

  await page.unroute("**/impressum**");
  await expect(page).toHaveTitle("Impressum · BDAS");
  await expect(page.getByRole(LOADER.role, { name: LOADER.name })).toBeHidden();
});

test("a fast navigation never flashes the loader", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("contentinfo").getByRole("link", { name: "Impressum" }).click();
  await expect(page).toHaveTitle("Impressum · BDAS");
  await expect(page.getByRole(LOADER.role, { name: LOADER.name })).toBeHidden();
});
