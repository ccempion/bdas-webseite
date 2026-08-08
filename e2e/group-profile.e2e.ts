/**
 * Issue #62 — the group's lead owns its master data.
 *
 * Covers the authorization boundary (lead in, plain local_board out) and the
 * banner drop target. Like `profile-photo-crop.e2e.ts`, the upload assertion
 * stops at the request that leaves the browser: object storage is not
 * configured in the E2E environment, so the signing route cannot succeed there.
 */
import { expect, test } from "@playwright/test";

import {
  grantLocalBoard,
  grantLocalBoardLead,
  groupContactEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { createProfile, logout, registerVerifyLogin } from "./helpers/flows";

// Smallest valid PNG; the banner field uploads what it is given, uncropped.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("the lead edits contact data and drops a banner; a plain local_board cannot", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-profil");
  const groupId = await seedGroup({
    slug,
    name: "E2E Profil Gruppe",
    city: "Profilstadt",
    status: "active",
  });

  // A plain local_board member is bounced to the group overview.
  const boardEmail = uniqueEmail("profil-board");
  await registerVerifyLogin(page, { email: boardEmail });
  await createProfile(page, {});
  await grantLocalBoard(boardEmail, groupId);
  await page.goto(`/gruppe/${slug}/profil`);
  await expect(page).toHaveURL(new RegExp(`/gruppe/${slug}/overview$`));

  // The lead gets the form.
  await logout(page);
  const leadEmail = uniqueEmail("profil-lead");
  await registerVerifyLogin(page, { email: leadEmail });
  await createProfile(page, {});
  await grantLocalBoardLead(leadEmail, groupId);

  await page.goto(`/gruppe/${slug}/profil`);
  await page.getByLabel("Kontakt-E-Mail").fill("profil@bdas.de");
  await page.getByLabel("Website").fill("https://profil.example");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert.")).toBeVisible();
  expect(await groupContactEmail(slug)).toBe("profil@bdas.de");

  // The banner asks the content route to sign an upload scoped to this group.
  const upload = page.waitForRequest((r) => r.url().includes("/api/content/upload-url"));
  await page.getByLabel("Titelbild auswählen").setInputFiles({
    name: "banner.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const body = JSON.parse((await upload).postData() ?? "{}") as {
    slug?: string;
    mimeType?: string;
  };
  expect(body.slug).toBe(`gruppen/${slug}`);
  expect(body.mimeType).toBe("image/png");

  // The public page links back into the editor for the lead.
  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toBeVisible();
});
