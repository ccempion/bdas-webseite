/**
 * Picking a profile photo opens the cropper; only what it produces is uploaded.
 */
import { expect, test } from "@playwright/test";

import { seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

// A 2x1 PNG, so the square crop has something to actually decide.
const WIDE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8z8DAwMDAwMAAAA4AAv0Ay5cAAAAASUVORK5CYII=",
  "base64",
);

test("Bildauswahl öffnet den Zuschnitt und lädt erst nach Übernehmen hoch", async ({ page }) => {
  const slug = uniqueSlug("crop");
  const groupId = await seedGroup({ slug, name: "Crop-Gruppe", city: "Bonn" });
  const email = uniqueEmail("crop");

  await registerVerifyLogin(page, { email, firstName: "Cara", lastName: "Crop" });
  await createProfile(page, { firstName: "Cara", lastName: "Crop", groupId });

  await page.goto("/account");
  await page.locator('input[type="file"]').setInputFiles({
    name: "breit.png",
    mimeType: "image/png",
    buffer: WIDE_PNG,
  });

  await expect(page.getByText("Bildausschnitt wählen")).toBeVisible();

  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByText("Bildausschnitt wählen")).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "breit.png",
    mimeType: "image/png",
    buffer: WIDE_PNG,
  });
  await expect(page.getByText("Bildausschnitt wählen")).toBeVisible();

  const upload = page.waitForRequest((r) => r.url().includes("/api/profile/upload-url"));
  await page.getByRole("button", { name: "Übernehmen" }).click();
  const request = await upload;

  // What leaves the browser is the cropper's output, not the PNG that was picked.
  const body = JSON.parse(request.postData() ?? "{}") as { filename?: string; mimeType?: string };
  expect(body.mimeType).toBe("image/webp");
  expect(body.filename).toBe("breit.webp");

  await expect(page.getByText("Bildausschnitt wählen")).toHaveCount(0);
});
