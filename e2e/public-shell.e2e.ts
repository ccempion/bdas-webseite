/**
 * Public shell (spec 2026-07-05): visitor navigation walk + the facets
 * guarantee — a logged-in active member sees strictly more events than a
 * visitor.
 */
import { expect, test } from "@playwright/test";

import { activateMemberByEmail, seedEvent, seedGroup, uniqueEmail, uniqueSlug } from "./helpers/db";
import { createProfile, registerVerifyLogin } from "./helpers/flows";

const BERLIN_YEAR_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
});

function berlinDateParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function berlinDateTimeParts(at: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Berlin-timezone offset at the given instant, in minutes (+60 CET / +120 CEST). */
function berlinOffsetMinutes(at: Date): number {
  const p = berlinDateTimeParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Pick an event start that is guaranteed to be (a) in the future and (b)
 * inside the month the landing calendar renders by default. Schedule-X's
 * month grid opens on the current month; the facets test asserts against a
 * specific day-cell, so the fixture must land there. `now + 7d` was the
 * original fixture, but whenever `now` falls within the last 7 days of the
 * month that pushes the event's Berlin-wall-clock day into next month, the
 * day-cell never renders — a deterministic flake on ~24% of days. If +7d
 * stays in the same Berlin month, use it; otherwise fall back to later today
 * (23:00 Europe/Berlin) — still upcoming, and always under the currently
 * displayed month's grid.
 */
function pickEventStart(now: Date): Date {
  const plus7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (BERLIN_YEAR_MONTH.format(now) === BERLIN_YEAR_MONTH.format(plus7)) return plus7;

  // End-of-day, not a fixed 23:00: `now`'s Berlin wall-clock time can itself
  // already be past 23:00 (e.g. 23:30), so anchoring to day-end guarantees
  // `laterToday >= now` for every `now` whose Berlin day is `today` — no
  // instant can be later than 23:59:59 on its own calendar day.
  const { year, month, day } = berlinDateParts(now);
  const guessUtcMs = Date.UTC(year, month - 1, day, 23, 59, 59);
  const offsetMin = berlinOffsetMinutes(new Date(guessUtcMs));
  const laterToday = new Date(guessUtcMs - offsetMin * 60_000);
  return laterToday >= now ? laterToday : new Date(now.getTime() + 60 * 60 * 1000);
}

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

/**
 * The header lives in the root layout, so a client-side navigation never
 * remounts it and the mobile menu's `open` is plain DOM state that nothing
 * resets. Following a link left the menu covering the page you just opened.
 */
test("the mobile menu closes after following a link", async ({ page }) => {
  await page.goto("/");

  const menu = page.locator('header details:has(summary[aria-label="Menü öffnen"])');
  await page.getByRole("banner").getByText("Menü").click();
  await expect(menu).toHaveAttribute("open", "");

  const mobileNav = page.getByRole("navigation", { name: "Hauptnavigation mobil" });
  await mobileNav.getByText("Über uns").click();
  await page.getByRole("link", { name: "Kurzportrait" }).click();
  await page.waitForURL("**/ueber-uns");

  await expect(menu).not.toHaveAttribute("open", "");
  await expect(mobileNav).toBeHidden();

  // Re-opening starts from a clean slate rather than the previously expanded
  // submenu.
  await page.getByRole("banner").getByText("Menü").click();
  await expect(page.getByRole("link", { name: "Kurzportrait" })).toBeHidden();
});

/**
 * The submenu used to sit on a filled panel, which read as "these four are
 * already selected" — on a touch device, where nothing else ever shows a hover
 * state, that is the only signal a visitor has to go on.
 */
test("the mobile submenu darkens the entry being pressed, not the whole group", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("banner").getByText("Menü").click();
  const mobileNav = page.getByRole("navigation", { name: "Hauptnavigation mobil" });
  await mobileNav.getByText("Über uns").click();

  const group = mobileNav.locator("details ul");
  await expect(group).toBeVisible();
  const groupFill = await group.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(groupFill).toBe("rgba(0, 0, 0, 0)");

  // The individual entry still has a pressed state to answer the tap.
  const entry = mobileNav.getByRole("link", { name: "Kurzportrait" });
  const rules = await entry.evaluate((el) => {
    const found: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        if (!rule.selectorText.includes(":active")) continue;
        const base = rule.selectorText.replace(/:active/g, "");
        if (el.matches(base) && rule.style.backgroundColor) found.push(rule.selectorText);
      }
    }
    return found;
  });
  expect(rules.length).toBeGreaterThan(0);
});

/**
 * Every other spec runs with the notice already dismissed (playwright.config),
 * because that is what a returning visitor has. These two opt back in to a
 * first visit — the only place the notice's own behaviour is exercised.
 */
test.describe("cookie notice", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("informs on the first visit and stays dismissed afterwards", async ({ page }) => {
    await page.goto("/");
    const notice = page.getByRole("region", { name: "Cookie-Hinweis" });
    await expect(notice).toBeVisible();

    await notice.getByRole("button", { name: "Verstanden" }).click();
    await expect(notice).toBeHidden();

    await page.goto("/ueber-uns");
    await expect(notice).toBeHidden();
  });

  test("leaves the foot of the page reachable while it is showing", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Cookie-Hinweis" })).toBeVisible();

    // The notice is `fixed bottom-0`. Without space reserved for it, the last
    // strip of the document sits under it permanently — scrolling cannot free
    // content that has nothing below it.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("contentinfo").getByRole("link", { name: "Impressum" }).click();
    await page.waitForURL("**/impressum");
  });
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
  const startsAt = pickEventStart(new Date());
  await seedEvent({
    title,
    groupId: null,
    visibility: "members_only",
    startsAt,
    createdBy: memberId,
  });

  // Logged-in active member sees it on the landing calendar. EventCalendar
  // opens on the agenda view, which renders each event as an accordion whose
  // summary carries the title — no day cell to expand.
  await page.goto("/");
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });

  // A fresh anonymous context never receives the event at all (filtered
  // server-side).
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByText(title)).toHaveCount(0);
});
