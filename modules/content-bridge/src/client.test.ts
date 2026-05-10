import { afterEach, describe, expect, it } from "vitest";

import { resetWpClient, setWpClient, WpClient, type Fetcher } from "./client";
import { getMenu } from "./services/menu";
import { getPost, listPosts } from "./services/posts";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  resetWpClient();
});

describe("WpClient.json", () => {
  it("returns parsed JSON on 2xx", async () => {
    const fetcher: Fetcher = async () => jsonResponse({ ok: true });
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));
    const out = await getMenu();
    expect(out.items).toEqual([]);
  });

  it("returns null on non-2xx", async () => {
    const fetcher: Fetcher = async () => new Response("nope", { status: 503 });
    const client = new WpClient({ baseUrl: "https://bdas.de", fetcher });
    expect(await client.json("/anything")).toBeNull();
  });

  it("returns null on transport error", async () => {
    const fetcher: Fetcher = async () => {
      throw new Error("ECONNREFUSED");
    };
    const client = new WpClient({ baseUrl: "https://bdas.de", fetcher });
    expect(await client.json("/anything")).toBeNull();
  });
});

describe("getMenu", () => {
  it("normalises the bdas/v1/menu shape and orders by `order`", async () => {
    const fetcher: Fetcher = async () =>
      jsonResponse({
        items: [
          { id: 2, title: "About", url: "https://bdas.de/about/", order: 20 },
          { id: 1, title: "Home", url: "https://bdas.de/", order: 10 },
          { id: 3, title: "Contact", url: "https://bdas.de/contact/", order: 30 },
        ],
      });
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));

    const m = await getMenu();
    expect(m.items.map((i) => i.title)).toEqual(["Home", "About", "Contact"]);
    expect(m.items[0]?.slug).toBe("");
    expect(m.items[1]?.slug).toBe("about");
  });

  it("returns an empty menu when the endpoint is missing", async () => {
    const fetcher: Fetcher = async () => new Response("not found", { status: 404 });
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));
    expect(await getMenu()).toEqual({ items: [] });
  });

  it("filters out malformed items rather than throwing", async () => {
    const fetcher: Fetcher = async () =>
      jsonResponse({
        items: [
          { id: 1, title: "Home", url: "https://bdas.de/", order: 10 },
          { title: "no id" },
          { id: 2, url: "https://bdas.de/about/", order: 20 },
        ],
      });
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));
    const m = await getMenu();
    expect(m.items.map((i) => i.id)).toEqual([1]);
  });
});

describe("listPosts", () => {
  it("strips HTML and decodes basic entities", async () => {
    const fetcher: Fetcher = async () =>
      jsonResponse([
        {
          id: 10,
          slug: "hallo",
          link: "https://bdas.de/hallo/",
          date_gmt: "2026-04-15T08:30:00",
          title: { rendered: "Gr&uuml;&szlig;e aus <em>Aachen</em>" },
          excerpt: { rendered: "<p>Erste Nachricht &amp; Hallo Welt.</p>" },
        },
      ]);
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));

    const posts = await listPosts({ limit: 3 });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.title).toBe("Grüße aus Aachen");
    expect(posts[0]?.excerpt).toBe("Erste Nachricht & Hallo Welt.");
    expect(posts[0]?.publishedAt.toISOString()).toBe("2026-04-15T08:30:00.000Z");
  });

  it("returns [] on outage", async () => {
    const fetcher: Fetcher = async () => new Response("", { status: 502 });
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));
    expect(await listPosts()).toEqual([]);
  });

  it("getPost(slug) hits the slug-filtered list endpoint", async () => {
    let capturedUrl = "";
    const fetcher: Fetcher = async (url) => {
      capturedUrl = String(url);
      return jsonResponse([
        {
          id: 7,
          slug: "willkommen",
          link: "https://bdas.de/willkommen/",
          date_gmt: "2026-01-01T00:00:00",
          title: { rendered: "Willkommen" },
          excerpt: { rendered: "" },
        },
      ]);
    };
    setWpClient(new WpClient({ baseUrl: "https://bdas.de", fetcher }));

    const post = await getPost("willkommen");
    expect(post?.id).toBe(7);
    expect(capturedUrl).toContain("/wp/v2/posts?slug=willkommen");
  });
});
