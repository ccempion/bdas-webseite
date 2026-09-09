/**
 * Newsletter PR 2 — the signed-in surfaces (spec §12 no. 2).
 *  - Ticking the box during registration lands as `subscribed` once the
 *    platform's own verification mail is clicked: no second mail, the
 *    `auth.user.verified` handler does it (§3.3).
 *  - Without the tick the account sees the prompt banner on /account and can
 *    answer it in one click.
 *  - Turning it off works only under "Mein Konto" (§3.4).
 *
 * Requires BDAS_FLAG_NEWSLETTER=true (or a preview deployment).
 */
import { expect, test } from "@playwright/test";

import {
  deleteNewsletterSubscriberByEmail,
  deleteUserByEmail,
  newsletterStatus,
  resetNewsletterRateLimits,
} from "./helpers/db";
import { registerVerifyLogin } from "./helpers/flows";

const unique = () => `nl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.org`;

test.describe("newsletter, signed-in surfaces", () => {
  test("the registration tick becomes a subscription after verification", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email, newsletter: true });

      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);

      await page.goto("/account/einstellungen");
      await expect(page.getByRole("switch", { name: "Newsletter" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("without the tick the banner appears and one click answers it", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email });

      await page.goto("/account");
      const banner = page.getByRole("heading", { name: "Bleib auf dem Laufenden" });
      await expect(banner).toBeVisible();

      await page.getByRole("button", { name: "Ja, ich bin dabei" }).click();
      await expect(page.getByText("Du bist dabei.")).toBeVisible();

      await page.reload();
      await expect(banner).toHaveCount(0);

      await page.goto("/account/einstellungen");
      await expect(page.getByRole("switch", { name: "Newsletter" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("dismissing keeps the banner away for the rest of the session", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email });

      await page.goto("/account");
      await page.getByRole("button", { name: "Später" }).click();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });

  test("turning it off happens only under Mein Konto", async ({ page }) => {
    const email = unique();
    try {
      await registerVerifyLogin(page, { email, newsletter: true });

      await page.goto("/account/einstellungen");
      const sw = page.getByRole("switch", { name: "Newsletter" });
      await sw.click();
      await expect(sw).toHaveAttribute("aria-checked", "false");

      // And nothing re-asks: an explicit no is an answer, not a gap (§6.1).
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);
    } finally {
      await deleteUserByEmail(email);
    }
  });
  test("a form signup after verification still counts as subscribed everywhere", async ({
    page,
  }) => {
    // The case reported from production: register first, sign up through the
    // public footer form afterwards. The row then carries the address and no
    // user id — `auth.user.verified` fired long before it existed — and every
    // surface used to keep offering the newsletter to someone already on it.
    const email = unique();
    try {
      await resetNewsletterRateLimits();
      await registerVerifyLogin(page, { email });

      await page.goto("/");
      const form = page
        .getByRole("contentinfo")
        .getByRole("region", { name: "Bleib in Verbindung" });
      await form.getByLabel("E-Mail-Adresse").fill(email);
      await form.getByRole("button", { name: "Ich bin dabei" }).click();
      await expect(page.getByText("Fast geschafft.")).toBeVisible();
      expect(await newsletterStatus(email)).toBe("pending");

      // No banner on /account …
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Bleib auf dem Laufenden" })).toHaveCount(0);

      // … and the switch sees the row instead of claiming "not subscribed".
      await page.goto("/account/einstellungen");
      await expect(page.getByText("Fast geschafft — bestätige noch den Link")).toBeVisible();
    } finally {
      await deleteNewsletterSubscriberByEmail(email);
      await deleteUserByEmail(email);
    }
  });
});
