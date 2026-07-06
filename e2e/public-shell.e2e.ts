/**
 * Public shell (spec 2026-07-05): visitor navigation walk + the facets
 * guarantee — a logged-in active member sees strictly more events than a
 * visitor.
 */
import { expect, test } from "@playwright/test";

import { activateMemberByEmail, seedEvent, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

test("visitor walks the public nav", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Bund der Alevitischen Studierenden/ }),
  ).toBeVisible();

  // Static pages via the Über-uns dropdown. This suite runs a mobile
  // viewport (Pixel 7) where the desktop nav (`hidden md:flex`) isn't
  // visible/actionable — open the mobile "Menü" disclosure first, then its
  // nested "Über uns" dropdown.
  // The mobile menu toggle is a bare <summary aria-label="Menü öffnen">
  // (not exposed with an ARIA button role), so target it by visible text.
  await page.getByRole("banner").getByText("Menü").click();
  const mobileNav = page.getByRole("navigation", { name: "Hauptnavigation mobil" });
  await mobileNav.getByText("Über uns").click();
  await page.getByRole("link", { name: "Kurzportrait" }).click();
  await page.waitForURL("**/ueber-uns");
  await expect(page.getByRole("heading", { name: "Über uns" })).toBeVisible();

  await page.goto("/unsere-arbeit");
  await expect(page.getByText("Ingenieurwesen & Technik")).toBeVisible();

  // Visitor CTA present.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Mitglied werden" }).first()).toBeVisible();
});

test("facets: member sees members-only event, visitor does not", async ({ page }) => {
  const slug = uniqueSlug("e2e-shell");
  await seedGroup({ slug, name: "E2E Shell Gruppe", city: "Teststadt", status: "active" });

  const email = uniqueEmail("shell-member");
  await registerVerifyLogin(page, { email });
  // A member row (status 'pending') only exists after the /account profile
  // form is submitted; then force it to 'active' directly so the test
  // doesn't have to run the full board-approval flow.
  await createProfile(page, { firstName: "Schale", lastName: "Mitglied" });
  const memberId = await activateMemberByEmail(email);

  const title = `Interner Termin ${slug}`;
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await seedEvent({
    title,
    groupId: null,
    visibility: "members_only",
    startsAt,
    createdBy: memberId,
  });

  // Logged-in active member sees it on the landing calendar. On the mobile
  // viewport this suite runs (Pixel 7), Schedule-X's month grid only shows a
  // dot indicator per day — the day cell must be opened to reveal titles.
  await page.goto("/");
  const dayLabel = startsAt.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
  await page.getByRole("button", { name: dayLabel, exact: true }).click();
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

  // A fresh anonymous context never receives the event at all (filtered
  // server-side), so it's absent even without expanding any day cell.
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByText(title)).toHaveCount(0);
});
