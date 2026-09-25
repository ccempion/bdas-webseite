/**
 * §23 — self-service account deletion, the full journey: request → lock
 * takes effect (login rejected) → reactivate → login works again (PR1–PR3);
 * and, for a second account that is *not* reactivated, request → the 30-day
 * sweep purges every module → the account is genuinely gone → e-mail C goes
 * out (PR8). The sweep step can't run through the real HTTP cron route in
 * this e2e environment (no object storage is provisioned — see
 * files.e2e.ts's header), so it calls the same real engine directly; see
 * docs/superpowers/plans/2026-09-25-account-deletion-pr9-e2e.md.
 */
import { expect, test } from "@playwright/test";

import { setMemberIdResolver as setFilesMemberIdResolver } from "@bdas/files";
import {
  setMemberIdResolver as setNotificationsMemberIdResolver,
  setNotifier,
  type OutboundEmail,
} from "@bdas/notifications";
import { setStorage, type StorageClient } from "@bdas/storage";
import { getDb } from "@bdas/db";

import {
  authUserExists,
  backdateDeletionRequest,
  memberIdByEmail,
  seedAccountDeletionFixture,
  userIdByEmail,
} from "./helpers/db";
import {
  extractReactivationToken,
  lastEmailTo,
  login,
  logout,
  PASSWORD,
  register,
  verify,
} from "./helpers/flows";

// The composition root PR8 ships — reused here so this test exercises the
// exact wiring production uses, not a hand-rolled copy that could drift.
import { buildDeletionSteps, completionMail } from "../apps/web/lib/account-deletion-composition";
import { runAccountDeletionSweep } from "@bdas/auth";

test("requesting deletion locks the account, and the reactivation link restores it", async ({
  page,
}) => {
  const email = `del-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page);
  await login(page, email);

  await page.goto("/account/einstellungen");
  await page.getByRole("button", { name: "Konto löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ja, endgültig löschen" }).click();

  await page.waitForURL("**/konto-loeschung-angefragt");
  await expect(page.getByText("Löschung wurde angefragt")).toBeVisible();

  // The session that made the request is revoked along with every other one.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden/);

  // Logging in with the correct password is rejected with the pending-deletion message.
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText(/Löschung vorgemerkt/)).toBeVisible();

  const captured = await lastEmailTo(page, email);
  expect(captured.subject).toContain("Löschung deines Kontos angefragt");
  const token = extractReactivationToken(captured.text);

  await page.goto(`/konto-reaktivieren/${token}`);
  await expect(page).toHaveURL(/\/konto-reaktivieren\?status=aktiv/);
  await expect(page.getByText("Löschung abgebrochen")).toBeVisible();

  // A second visit to the same link is now invalid — the token was single-use.
  await page.goto(`/konto-reaktivieren/${token}`);
  await expect(page).toHaveURL(/\/konto-reaktivieren\?status=ungueltig/);

  await login(page, email);
  await expect(page).not.toHaveURL(/\/anmelden/);
  await logout(page);
});

test("requesting deletion, then letting the sweep run, purges the account across every module and sends e-mail C", async ({
  page,
}) => {
  const email = `del-sweep-${Date.now()}@example.de`;

  await register(page, { email });
  await verify(page);
  await login(page, email);

  const userId = await userIdByEmail(email);
  if (!userId) throw new Error("no auth_users row after registration");
  const memberId = await memberIdByEmail(email);
  if (!memberId) throw new Error("no members row after registration");

  // Real, attributable data in every module the sweep purges — seeded
  // directly (each module's own authoring UI is already covered by its own
  // e2e spec; this test's job is the purge, not re-proving authoring).
  const fixture = await seedAccountDeletionFixture(userId, memberId);

  await page.goto("/account/einstellungen");
  await page.getByRole("button", { name: "Konto löschen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ja, endgültig löschen" }).click();
  await page.waitForURL("**/konto-loeschung-angefragt");

  // The lock takes effect — same assertion shape as the reactivation test.
  await page.goto("/account/einstellungen");
  await expect(page).toHaveURL(/\/anmelden/);

  // Stand in for the real 30-day wait.
  await backdateDeletionRequest(userId, 1);

  // Wire the two true externals + both member-id resolvers this test's own
  // Node process needs — the app server's own boot never reaches this
  // process (see the file header).
  function memoryBucket(keys: string[]) {
    const objects = new Set(keys);
    return {
      objects,
      async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
        let deleted = 0;
        for (const k of [...objects]) {
          if (k.startsWith(prefix)) {
            objects.delete(k);
            deleted++;
          }
        }
        return { deleted };
      },
      async deleteObject(key: string): Promise<void> {
        objects.delete(key);
      },
    };
  }
  const filesBucket = memoryBucket([fixture.fileStorageKey]);
  const blogBucket = memoryBucket([fixture.blogMediaKey]);
  const profileBucket = memoryBucket([fixture.profileMediaKey]);
  setStorage(filesBucket as unknown as StorageClient);

  const resolver = { resolveMemberId: async () => memberId };
  setFilesMemberIdResolver(resolver as never);
  setNotificationsMemberIdResolver(resolver as never);

  const sent: OutboundEmail[] = [];
  setNotifier({
    async send(mail) {
      sent.push(mail);
    },
  });

  const result = await runAccountDeletionSweep(getDb(), {
    steps: buildDeletionSteps({
      blogMedia: () => blogBucket as never,
      profileMedia: () => profileBucket as never,
    }),
    completionMail,
  });

  // Assert on this request specifically, not the sweep's aggregate counts —
  // a stale row from an earlier interrupted local run could otherwise flake
  // an aggregate-count assertion (see the plan's Review Focus).
  expect(result.failed).toEqual([]);
  expect(await authUserExists(email)).toBe(false);
  expect([...filesBucket.objects]).toEqual([]);
  expect([...blogBucket.objects]).toEqual([]);
  expect([...profileBucket.objects]).toEqual([]);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.to).toBe(email);

  // Genuinely gone, not merely still pending — the generic message, not the
  // pending-deletion-specific one (login.ts:74-87).
  await page.goto("/anmelden");
  await page.getByLabel("E-Mail", { exact: true }).fill(email);
  await page.getByLabel("Passwort", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText("E-Mail oder Passwort ungültig.")).toBeVisible();
  await expect(page.getByText(/Löschung vorgemerkt/)).toHaveCount(0);
});
