/**
 * Group map: a group's lead sets the location on their own profile page
 * (Photon stubbed), then the public map on /gruppen and the start page shows
 * the pin, whose popup links to the group page.
 * Requires BDAS_FLAG_GROUP_MAP=true (set in the CI e2e job env).
 */
import { expect, test } from "@playwright/test";

import {
  grantLocalBoardLead,
  groupContactEmail,
  seedGroup,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

const PHOTON_FIXTURE = {
  features: [
    {
      geometry: { coordinates: [6.9285, 50.9271] },
      properties: { name: "Universität zu Köln", street: "Albertus-Magnus-Platz", city: "Köln" },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  // Hermetic: never talk to photon.komoot.io or the OSM tile servers.
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: PHOTON_FIXTURE }),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
});

test("the lead sets a location; the public map pin links to the group page", async ({ page }) => {
  const slug = uniqueSlug("e2e-karte");
  const groupId = await seedGroup({
    slug,
    name: "E2E Karten Gruppe",
    city: "Köln",
    status: "active",
    contactEmail: "karte@bdas.de",
  });

  const email = uniqueEmail("karte");
  await registerVerifyLogin(page, { email });
  await createProfile(page, {});
  await grantLocalBoardLead(email, groupId); // takes effect on next request (DB-read grants)

  // Set the location on the group's own profile page (Photon is stubbed above).
  await page.goto(`/gruppe/${slug}/profil`);
  await page.getByLabel("Ort (suchen)").fill("Uni Köln");
  await page.getByRole("button", { name: /Universität zu Köln/ }).click();
  await page.getByRole("button", { name: "Speichern" }).click();
  // Match any outcome the form can report (GroupProfileForm renders either
  // "Gespeichert." or the action's error), so a failed save shows up as the
  // actual message rather than an opaque timeout on the success string.
  const saveResult = page.getByText(
    /^(Gespeichert\.|Fehler|Nicht angemeldet\.|Keine Berechtigung|Gruppe nicht gefunden\.|Archivierte)/,
  );
  await expect(saveResult).toBeVisible();
  await expect(saveResult).toHaveText("Gespeichert.");

  // Regression: a save from this form must not wipe the seeded contact address
  // — it now round-trips through the form instead of being merged server-side.
  expect(await groupContactEmail(slug)).toBe("karte@bdas.de");

  // /gruppen renders the map; the pin's popup links to the group page.
  await page.goto("/gruppen");
  await page.locator(".leaflet-marker-icon").click();
  const popupLink = page.getByRole("link", { name: "Zur Gruppenseite →" });
  await expect(popupLink).toBeVisible();
  await expect(popupLink).toHaveAttribute("href", `/gruppen/${slug}`);

  // The start page block renders the map too.
  await page.goto("/");
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible();
});
