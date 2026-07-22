/**
 * Editable group pages (spec 2026-07-18, ADR 0025): public view, editor
 * gating, lead entry into Puck. Requires BDAS_FLAG_GROUPS, BDAS_FLAG_CONTENT,
 * BDAS_FLAG_PUBLIC_SHELL and BDAS_FLAG_AUTH in the e2e env.
 */
import { expect, test } from "@playwright/test";

import {
  memberIdByEmail,
  seedEvent,
  seedGroup,
  seedRoleGrant,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
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

test("a page_editor publishes Puck content and the public group page renders it", async ({
  page,
}) => {
  const slug = uniqueSlug("e2e-puckcontent");
  const groupId = await seedGroup({ slug, name: "E2E Puckgruppe", city: "Teststadt" });
  const email = uniqueEmail("puckeditor");
  await registerVerifyLogin(page, { email, firstName: "Puck", lastName: "Editor" });
  await createProfile(page, { firstName: "Puck", lastName: "Editor" });

  let memberId: string | null = null;
  await expect(async () => {
    memberId = await memberIdByEmail(email);
    expect(memberId, `member id for ${email}`).toBeTruthy();
  }).toPass({ timeout: 10_000 });
  await seedRoleGrant(memberId as string, "page_editor", groupId);

  // Save Puck content via the same PUT route the editor's Publish button
  // calls (PuckEditor -> PUT /api/content/pages/gruppen/<slug>). Driving this
  // through the actual Puck drawer would need real drag-and-drop —
  // @puckeditor/core@0.22.2 (installed under the ^0.22.1 range) only adds a
  // drawer component on drop, not on click, so the click-based flow the
  // *editor gating* test above and content-pages.e2e.ts's Button test use is
  // for reaching/gating the editor, not for reliably placing a block. The
  // route itself re-checks canEditGroupPage via `me.grants`, so this still
  // exercises the authorization this test cares about — only the drag
  // interaction is swapped out. page.request shares this page's session
  // cookie for same-origin requests.
  await page.goto(`/gruppen/${slug}`);
  const headingText = `Puck Inhalt ${slug}`;
  const res = await page.request.put(`/api/content/pages/gruppen/${slug}`, {
    data: {
      data: {
        root: { props: {} },
        content: [
          { type: "Ueberschrift", props: { id: "e2e-heading-1", text: headingText, ebene: "h2" } },
        ],
      },
    },
  });
  expect(res.ok(), `PUT /api/content/pages/gruppen/${slug} -> ${res.status()}`).toBe(true);

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("heading", { level: 2, name: headingText })).toBeVisible();
});

test("the group page shows an upcoming published event under Kommende Events", async ({ page }) => {
  const slug = uniqueSlug("e2e-events");
  const groupId = await seedGroup({ slug, name: "E2E Eventgruppe", city: "Teststadt" });
  const eventTitle = `E2E Gruppentreffen ${slug}`;
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const eventId = await seedEvent({
    title: eventTitle,
    groupId,
    visibility: "public",
    startsAt,
    createdBy: "usr_e2e_seed",
  });

  await page.goto(`/gruppen/${slug}`);
  await expect(page.getByRole("heading", { level: 2, name: "Kommende Events" })).toBeVisible();
  const eventLink = page.getByRole("link", { name: new RegExp(eventTitle) });
  await expect(eventLink).toBeVisible();
  await expect(eventLink).toHaveAttribute("href", `/events/${eventId}`);
});
