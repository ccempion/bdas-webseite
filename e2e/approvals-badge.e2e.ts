/**
 * The approval badge: a board with something to decide sees a number at its
 * name and a to-do line on /account; a plain member sees neither.
 */
import { expect, test } from "@playwright/test";

import {
  activateMemberByEmail,
  grantLocalBoard,
  seedGroup,
  seedGroupTransferRequest,
  uniqueEmail,
  uniqueSlug,
} from "./helpers/db";
import { createProfile, login, logout, registerVerifyLogin } from "./helpers/flows";

test("ein Vorstand mit offener Freigabe sieht Zahl und Hinweis", async ({ page }) => {
  const slug = uniqueSlug("badge");
  const groupId = await seedGroup({ slug, name: "Badge-Gruppe", city: "Aachen" });
  const otherGroupId = await seedGroup({
    slug: uniqueSlug("herkunft"),
    name: "Herkunfts-Gruppe",
    city: "Bonn",
  });

  const boardEmail = uniqueEmail("board");
  await registerVerifyLogin(page, { email: boardEmail, firstName: "Bea", lastName: "Vorstand" });
  await createProfile(page, { firstName: "Bea", lastName: "Vorstand", groupId });
  await grantLocalBoard(boardEmail, groupId);
  await logout(page);

  // The account page's alert only lists group transfers and open reports
  // (fix(account) f66b2bd: applications stay in the header badge and the
  // group's own queue). So the "board sees the alert" case needs an active
  // member of one group requesting to move into the board's group, not a
  // first-time application.
  const moverEmail = uniqueEmail("wechsel");
  await registerVerifyLogin(page, { email: moverEmail, firstName: "Toni", lastName: "Wechsel" });
  await createProfile(page, { firstName: "Toni", lastName: "Wechsel", groupId: otherGroupId });
  await activateMemberByEmail(moverEmail);
  await seedGroupTransferRequest(moverEmail, otherGroupId, groupId);
  await logout(page);

  await login(page, boardEmail);
  await page.goto("/account");

  await expect(page.getByRole("status", { name: /offene Freigaben/ }).first()).toBeVisible();
  await expect(page.getByText("Es wartet etwas auf dich")).toBeVisible();
  // Transfers are decided by the destination board (ADR 0022), and the board
  // here is itself still groupless (its own application is open), so this also
  // pins that the link is derived from the grant rather than primaryGroupId.
  const link = page.getByRole("link", { name: /Gruppenwechsel entscheiden/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/gruppe/${slug}/members`);
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
