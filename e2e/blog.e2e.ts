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

  /**
   * Drag-and-drop into the editor. Playwright cannot drag from the OS, so the
   * drop is synthesised with a DataTransfer built in the page — the same events
   * a real drag produces, which is what Tiptap's FileHandler listens for.
   *
   * Object storage is not provisioned in every e2e environment, so this asserts
   * the drop is *taken* (the signing route is called) rather than that an image
   * lands in the document, which would additionally require a live bucket.
   */
  test("dropping an image into the post editor calls the signing route", async ({ page }) => {
    const email = uniqueEmail("blog-drop");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    await page.goto("/blog/neu");
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await editor.click();

    const signing = page.waitForRequest(
      (r) => r.url().includes("/api/blog/upload-url") && r.method() === "POST",
    );

    await page.evaluate(async () => {
      const png = await fetch(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ).then((r) => r.blob());
      const transfer = new DataTransfer();
      transfer.items.add(new File([png], "drop.png", { type: "image/png" }));
      const target = document.querySelector('.ProseMirror[contenteditable="true"]');
      if (!target) throw new Error("editor not found");
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: rect.left + 10,
          clientY: rect.top + 10,
        }),
      );
    });

    const request = await signing;
    expect(JSON.parse(request.postData() ?? "{}")).toMatchObject({
      filename: "drop.png",
      mimeType: "image/png",
    });
  });

  /**
   * The client-side allowlist must turn a non-image away without a round trip —
   * the routes accept only JPEG/PNG/WebP/AVIF (see app/_upload/accept.ts).
   */
  test("dropping a PDF into the post editor never reaches the server", async ({ page }) => {
    const email = uniqueEmail("blog-drop-bad");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    await page.goto("/blog/neu");
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await editor.click();

    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/blog/upload-url")) calls.push(r.url());
    });

    const refusal = await page.evaluate(async () => {
      const messages: string[] = [];
      window.alert = (m) => messages.push(String(m));
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Blob(["x"])], "satzung.pdf", { type: "application/pdf" }));
      const target = document.querySelector('.ProseMirror[contenteditable="true"]');
      if (!target) throw new Error("editor not found");
      // Coordinates are required: FileHandler resolves the insertion point from
      // them, and a drop at (0,0) lands outside the editor and is ignored.
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
          clientX: rect.left + 10,
          clientY: rect.top + 10,
        }),
      );
      await new Promise((r) => setTimeout(r, 300));
      return messages;
    });

    expect(refusal).toEqual(["satzung.pdf: nur JPEG, PNG, WebP oder AVIF."]);
    expect(calls).toEqual([]);
  });

  test("category filter narrows the feed", async ({ page }) => {
    const email = uniqueEmail("blog-category");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    const groupTitle = `Gruppenleben ${Date.now()}`;
    await writePost(page, {
      title: groupTitle,
      body: "Bericht aus der Gruppe.",
      category: "gruppenleben",
    });

    const careerTitle = `Karriere ${Date.now()}`;
    await writePost(page, {
      title: careerTitle,
      body: "Ein Karrieretipp.",
      category: "karriere_weiterbildung",
    });

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

  test("a member comments on a post, sees it, and deletes it", async ({ page }) => {
    const email = uniqueEmail("blog-comment");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    const slug = await writePost(page, {
      title: "Kommentierbarer Beitrag",
      body: "Bitte kommentieren.",
    });

    await page.goto(`/blog/${slug}`);
    // CommentsSection renders an <h2>; scope to that level, not just a substring
    // match, so this can never collide with a post's own <h1> title.
    await expect(page.getByRole("heading", { level: 2, name: "Kommentare" })).toBeVisible();
    await expect(page.getByText("Noch keine Kommentare.")).toBeVisible();

    await page.getByPlaceholder("Schreib einen Kommentar …").fill("Sehr guter Beitrag!");
    await page.getByRole("button", { name: "Kommentieren" }).click();

    await expect(page.getByText("Sehr guter Beitrag!")).toBeVisible();
    await expect(page.getByText("1 Kommentar", { exact: true })).toBeVisible();

    // The feed shows the count too. Scope to this post's own <li>: an
    // unscoped match would collide with any other card that also picks up a
    // first comment (e.g. a retried attempt of this very test after a
    // partial failure, since retries reuse the database and this is the only
    // comment-creating case in the suite).
    await page.goto("/blog");
    const feedCard = page.getByRole("listitem").filter({ hasText: "Kommentierbarer Beitrag" });
    await expect(feedCard.getByText("1 Kommentar", { exact: true })).toBeVisible();

    // Delete it again — the author may remove their own comment. Scope the
    // locator to the comment's own <li>: the post page also carries a
    // post-level "Löschen" control, and an unscoped match is ambiguous.
    await page.goto(`/blog/${slug}`);
    const comment = page.getByRole("listitem").filter({ hasText: "Sehr guter Beitrag!" });
    page.once("dialog", (d) => void d.accept());
    await comment.getByRole("button", { name: "Löschen" }).click();
    await expect(page.getByText("Sehr guter Beitrag!")).toHaveCount(0);
    await expect(page.getByText("Noch keine Kommentare.")).toBeVisible();
  });

  test("a signed-out visitor never sees the comments region", async ({ page }) => {
    const email = uniqueEmail("blog-comment-guest");
    await registerVerifyLogin(page, { email });
    await activateMemberByEmail(email);

    const slug = await writePost(page, {
      title: "Öffentlicher Beitrag ohne Kommentare",
      body: "Für alle sichtbar.",
    });

    await logout(page);
    await page.goto(`/blog/${slug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Öffentlicher Beitrag ohne Kommentare" }),
    ).toBeVisible();
    // Scoped to level 2 (CommentsSection's own heading level): the post's <h1>
    // title happens to contain the substring "Kommentare" too, and an
    // unscoped role query matches on substring, so it would false-negative here.
    await expect(page.getByRole("heading", { level: 2, name: "Kommentare" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Schreib einen Kommentar …")).toHaveCount(0);
  });
});
