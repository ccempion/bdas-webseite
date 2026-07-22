/**
 * Editable group pages (spec 2026-07-18, ADR 0025): public view, editor
 * gating, lead entry into Puck. Requires BDAS_FLAG_GROUPS, BDAS_FLAG_CONTENT,
 * BDAS_FLAG_PUBLIC_SHELL and BDAS_FLAG_AUTH in the e2e env.
 */
import { expect, test } from "@playwright/test";

import { memberIdByEmail, seedGroup, seedRoleGrant, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

test("anonymous visitors see the group page without an edit entry; /bearbeiten is 404", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-seite");
  await seedGroup({ slug, name: "E2E Seitengruppe", city: "Teststadt" });

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Seitengruppe" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);

  const res = await page.goto(`/gruppen/${slug}/bearbeiten`);
  expect(res?.status()).toBe(404);
});

test("a member without page_editor gets no edit entry and a 404 on /bearbeiten", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-noedit");
  await seedGroup({ slug, name: "E2E Ohne Rechte", city: "Teststadt" });
  await registerVerifyLogin(page, {
    email: uniqueEmail("plainmember"),
    firstName: "Plain",
    lastName: "Member",
  });

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("link", { name: "Seite bearbeiten" })).toHaveCount(0);
  const res = await page.goto(`/gruppen/${slug}/bearbeiten`);
  expect(res?.status()).toBe(404);
});

test("a page_editor reaches the Puck editor from the group page", async ({ page }) => {
  const slug = uniqueSlug("e2e-editor");
  const groupId = await seedGroup({ slug, name: "E2E Editorgruppe", city: "Teststadt" });
  const email = uniqueEmail("pageeditor");
  await registerVerifyLogin(page, { email, firstName: "Page", lastName: "Editor" });
  // A member row only exists once /account's profile form is submitted
  // (members module `createProfile`); registerVerifyLogin alone doesn't
  // create one, and the role grant below needs a member id to attach to.
  await createProfile(page, { firstName: "Page", lastName: "Editor" });

  // memberIdByEmail races the profile-create Server Action's commit (same
  // race grantLocalBoard/activateMemberByEmail in helpers/db.ts poll for);
  // poll until the row lands.
  let memberId: string | null = null;
  await expect(async () => {
    memberId = await memberIdByEmail(email);
    expect(memberId, `member id for ${email}`).toBeTruthy();
  }).toPass({ timeout: 10_000 });
  await seedRoleGrant(memberId as string, "page_editor", groupId);

  await page.goto(`/gruppen/${slug}`);
  await page.getByRole("link", { name: "Seite bearbeiten" }).click();
  // Puck chrome is English; Publish is a <span> behind the collapsed menu on
  // mobile viewports (same caveats as content-pages.e2e.ts).
  await page.getByRole("button", { name: "Toggle menu bar" }).click();
  await expect(page.getByText("Publish", { exact: true })).toBeVisible();
});
