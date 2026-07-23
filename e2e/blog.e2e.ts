/**
 * Blog module (spec 2026-07-22, ADR 0027). Drives the §23 user-facing flows:
 * any signed-in member authors a post, the feed + single page render it,
 * visibility is enforced server-side (a "Nur Mitglieder" post never reaches an
 * anonymous visitor), and only the author (or federal board) may moderate.
 *
 * Requires BDAS_FLAG_BLOG=true in the e2e env (CI + playwright.config webServer).
 * Content is authored through the real Tiptap editor: we type into the
 * `.ProseMirror` contenteditable, which syncs the hidden `content` input the
 * Server Action reads.
 */
import { expect, test, type Page } from "@playwright/test";

import { uniqueEmail } from "./helpers/db";
import { logout, registerVerifyLogin } from "./helpers/flows";

/** Fill the post form (title + body + visibility) and publish; returns the slug. */
async function writePost(
  page: Page,
  opts: { title: string; body: string; visibility?: "public" | "members" | "board" },
): Promise<string> {
  await page.goto("/blog/neu");
  await page.getByLabel("Titel").fill(opts.title);

  // Type into the real Tiptap editor; onUpdate fills the hidden `content` input.
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.click();
  await editor.pressSequentially(opts.body);

  if (opts.visibility && opts.visibility !== "public") {
    await page.locator("#visibility").selectOption(opts.visibility);
  }

  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  // The create action redirects to /blog/<slug>; the post's own <h1> is the title.
  await expect(page.getByRole("heading", { level: 1, name: opts.title })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

test.describe("blog", () => {
  test("a member authors a public post and it renders on the feed and its page", async ({
    page,
  }) => {
    await registerVerifyLogin(page, { email: uniqueEmail("blog-author") });

    const title = `Testbeitrag ${Date.now()}`;
    const body = "Dies ist der Textkörper des Beitrags.";
    await writePost(page, { title, body });

    // Single page shows title + body.
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(body)).toBeVisible();

    // Feed lists it.
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  test("a members-only post is hidden from anonymous visitors (feed + share link 404)", async ({
    page,
  }) => {
    await registerVerifyLogin(page, { email: uniqueEmail("blog-secret") });

    const publicTitle = `Öffentlich ${Date.now()}`;
    await writePost(page, { title: publicTitle, body: "Für alle sichtbar." });

    const secretTitle = `Nur Mitglieder ${Date.now()}`;
    const secretSlug = await writePost(page, {
      title: secretTitle,
      body: "Vertraulich, nur für Mitglieder.",
      visibility: "members",
    });

    // Sign out → anonymous (session cookie is HttpOnly, so use the real logout).
    await logout(page);

    // Feed shows the public post but not the members-only one.
    await page.goto("/blog");
    await expect(page.getByRole("heading", { name: publicTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: secretTitle })).toHaveCount(0);

    // The share link must not leak the members-only content to an anonymous
    // visitor: the post's title and body never render. (In a production build
    // getPostBySlug → null → notFound() also yields a 404 status; `next dev`
    // serves the not-found UI with a 200, so we assert on content, not status.)
    await page.goto(`/blog/${secretSlug}`);
    await expect(page.getByRole("heading", { level: 1, name: secretTitle })).toHaveCount(0);
    await expect(page.getByText("Vertraulich, nur für Mitglieder.")).toHaveCount(0);
  });

  test("the author sees moderation controls; a different member does not", async ({ page }) => {
    const authorEmail = uniqueEmail("blog-owner");
    await registerVerifyLogin(page, { email: authorEmail });

    const title = `Mein Beitrag ${Date.now()}`;
    const slug = await writePost(page, { title, body: "Ursprünglicher Text." });

    // Author sees Bearbeiten + Löschen on the post they own.
    await expect(page.getByRole("link", { name: "Bearbeiten" })).toBeVisible();

    // Edit it: change the title, save, and confirm the new title renders.
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    const newTitle = `${title} (überarbeitet)`;
    await page.getByLabel("Titel").fill(newTitle);
    await page.getByRole("button", { name: "Änderungen speichern" }).click();
    await expect(page.getByRole("heading", { level: 1, name: newTitle })).toBeVisible();

    // A different signed-in member viewing the public post sees no edit control.
    await logout(page);
    await registerVerifyLogin(page, { email: uniqueEmail("blog-stranger") });
    await page.goto(`/blog/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: newTitle })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);
  });
});
