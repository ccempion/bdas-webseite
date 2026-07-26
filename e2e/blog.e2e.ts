/**
 * Blog module (spec 2026-07-22, ADR 0027). Drives the §23 user-facing flows:
 * an active member or alumnus authors a post (ADR 0030 — `canAuthor()`; a
 * `pending` member is redirected away from `/blog/neu`), the feed + single
 * page render it, visibility is enforced server-side (a "Nur Mitglieder" post
 * never reaches an anonymous visitor), and only the author (or federal board)
 * may moderate.
 *
 * `registerVerifyLogin` creates a member with `status: "pending"`, so any
 * user who goes on to author a post is explicitly activated afterwards via
 * `activateMemberByEmail` — otherwise `writePost`'s first action would find
 * no form (redirected back to /blog by `requirePostAuthor()`).
 *
 * Requires BDAS_FLAG_BLOG=true in the e2e env (CI + playwright.config webServer).
 * Content is authored through the real Tiptap editor: we type into the
 * `.ProseMirror` contenteditable, which syncs the hidden `content` input the
 * Server Action reads.
 */
import { expect, test, type Page } from "@playwright/test";

import type { PostCategory } from "@bdas/blog";

import { activateMemberByEmail, uniqueEmail } from "./helpers/db";
import { logout, registerVerifyLogin } from "./helpers/flows";

/** Fill the post form (title + body + category + visibility) and publish; returns the slug. */
async function writePost(
  page: Page,
  opts: {
    title: string;
    body: string;
    category?: PostCategory;
    visibility?: "public" | "members" | "board";
  },
): Promise<string> {
  await page.goto("/blog/neu");
  await page.getByLabel("Titel").fill(opts.title);

  // Type into the real Tiptap editor; onUpdate fills the hidden `content` input.
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.click();
  await editor.pressSequentially(opts.body);

  if (opts.category && opts.category !== "sonstiges") {
    await page.locator("#category").selectOption(opts.category);
  }
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
    const email = uniqueEmail("blog-author");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

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
    const email = uniqueEmail("blog-secret");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

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
    await activateMemberByEmail(authorEmail);

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

  test("category filter narrows the feed", async ({ page }) => {
    const email = uniqueEmail("blog-category");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    const groupTitle = `Gruppenleben ${Date.now()}`;
    await writePost(page, { title: groupTitle, body: "Bericht aus der Gruppe.", category: "gruppenleben" });

    const careerTitle = `Karriere ${Date.now()}`;
    await writePost(page, { title: careerTitle, body: "Ein Karrieretipp.", category: "karriere_weiterbildung" });

    await page.goto("/blog?kategorie=gruppenleben");
    await expect(page.getByRole("heading", { name: groupTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: careerTitle })).toHaveCount(0);
  });

  test("a reported post appears in the federal board's queue; a non-board member is forbidden", async ({
    page,
  }) => {
    const authorEmail = uniqueEmail("blog-reported-author");
    await registerVerifyLogin(page, { email: authorEmail });
    await activateMemberByEmail(authorEmail);
    const title = `Gemeldet ${Date.now()}`;
    await writePost(page, { title, body: "Fragwürdiger Inhalt." });

    await logout(page);
    await registerVerifyLogin(page, { email: uniqueEmail("blog-reporter") });
    await page.goto("/blog");
    await page.getByRole("heading", { name: title }).click();
    await page.getByText("Beitrag melden").click();
    await page.getByPlaceholder("Grund (optional)").fill("Testmeldung");
    await page.getByRole("button", { name: "Melden" }).click();
    await expect(page.getByText("Danke, die Meldung ist eingegangen.")).toBeVisible();

    // A non-board member is forbidden from the moderation queue.
    await page.goto("/blog/meldungen");
    await expect(page.getByRole("heading", { name: "Gemeldete Beiträge" })).toHaveCount(0);
  });
});
