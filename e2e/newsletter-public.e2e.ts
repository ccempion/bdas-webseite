/**
 * Newsletter PR 3 — the public capture path (spec §12 no. 3).
 *  - The footer form creates a `pending` row and says the same thing to
 *    everyone (§8 no. 4).
 *  - The unsubscribe route does NOT act on GET, so a mailbox scanner cannot
 *    unsubscribe anybody.
 *  - The honeypot stays out of the accessibility tree (§8 no. 2).
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test } from "@playwright/test";

import {
  deleteNewsletterSubscriberByEmail,
  newsletterStatus,
  resetNewsletterRateLimits,
} from "./helpers/db";

const unique = () => `nlp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.org`;

test.describe("newsletter, public capture", () => {
  test("the footer form creates a pending row and confirms nothing yet", async ({ page }) => {
    // Five signups per IP per hour, and the whole run is one IP — without this
    // the cap swallows the signup silently and the failure looks like a bug in
    // the form rather than a spent budget.
    await resetNewsletterRateLimits();
    const email = unique();
    try {
      await page.goto("/");
      const form = page.getByRole("region", { name: "Bleib in Verbindung" });
      await form.getByLabel("E-Mail-Adresse").fill(email);
      await form.getByRole("button", { name: "Ich bin dabei" }).click();

      await expect(page.getByText("Fast geschafft.")).toBeVisible();
      // Double opt-in: the row exists but is not on the list yet (§3.2).
      expect(await newsletterStatus(email)).toBe("pending");
    } finally {
      await deleteNewsletterSubscriberByEmail(email);
    }
  });

  test("an unknown confirmation token offers a fresh signup instead of an error", async ({
    page,
  }) => {
    await page.goto("/newsletter/bestaetigen?token=gibtsnicht");
    await expect(page.getByText("Dieser Link ist abgelaufen")).toBeVisible();
    await expect(page.getByRole("link", { name: "Zur Newsletter-Seite" })).toBeVisible();
  });

  test("opening the unsubscribe link does not unsubscribe anybody", async ({ page }) => {
    // A mailbox scanner follows links before a person does. Merely loading the
    // page must therefore change nothing — the button is the action.
    await page.goto("/newsletter/abmelden?token=gibtsnicht");
    await expect(page.getByText("Dieser Link führt ins Leere")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ja, abmelden" })).toHaveCount(0);
  });

  test("the /newsletter page carries the form exactly once", async ({ page }) => {
    await page.goto("/newsletter");
    await expect(page.getByRole("heading", { name: "Newsletter", level: 1 })).toBeVisible();
    // The footer is on this page too, so without `hideOnPath` there would be
    // two identical forms stacked on top of each other.
    await expect(page.getByRole("button", { name: "Ich bin dabei" })).toHaveCount(1);
  });

  test("the honeypot is not reachable by keyboard or screen reader", async ({ page }) => {
    await page.goto("/");
    // It carries no label and sits behind aria-hidden, so nothing that reads
    // the accessibility tree reaches it — and no other page in the app has to
    // dodge a second field called "Website".
    await expect(page.getByRole("textbox", { name: "Website" })).toHaveCount(0);
    await expect(page.getByLabel("Website")).toHaveCount(0);

    // It stays a real text input on purpose — that is what a naive bot fills —
    // so it is parked off-screen rather than hidden, and `toBeHidden` would not
    // describe it: the input keeps its own layout box inside the clipped
    // wrapper. What matters is that nobody can see it or tab into it.
    const honeypot = page.locator('input[name="website"]').first();
    await expect(honeypot).toHaveAttribute("tabindex", "-1");
    const box = await honeypot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(0);
  });
});
