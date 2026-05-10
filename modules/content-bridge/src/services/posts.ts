/**
 * Latest posts for the dashboard homepage.
 *
 * Returns [] (never throws) on WP outage — see ADR 0004.
 */
import { getWpClient } from "../client.js";
import type { Post } from "../types.js";

type RawPost = {
  id?: number;
  slug?: string;
  date_gmt?: string;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
};

const HTML_TAG = /<[^>]+>/g;
const WHITESPACE = /\s+/g;

function stripHtml(html: string): string {
  return html.replace(HTML_TAG, "").replace(WHITESPACE, " ").trim();
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß");
}

function toPost(r: RawPost): Post | null {
  if (
    typeof r.id !== "number" ||
    typeof r.slug !== "string" ||
    typeof r.link !== "string" ||
    !r.title?.rendered ||
    !r.date_gmt
  ) {
    return null;
  }
  const publishedAt = new Date(`${r.date_gmt}Z`);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: decodeBasicEntities(stripHtml(r.title.rendered)),
    excerpt: decodeBasicEntities(stripHtml(r.excerpt?.rendered ?? "")),
    link: r.link,
    publishedAt,
  };
}

export async function listPosts(opts: { limit?: number } = {}): Promise<Post[]> {
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
  const raw = await getWpClient().json<RawPost[]>(
    `/wp/v2/posts?per_page=${limit}&_fields=id,slug,date_gmt,link,title,excerpt`,
  );
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map(toPost).filter((p): p is Post => p !== null);
}

export async function getPost(idOrSlug: number | string): Promise<Post | null> {
  if (typeof idOrSlug === "number") {
    const raw = await getWpClient().json<RawPost>(`/wp/v2/posts/${idOrSlug}`);
    return raw ? toPost(raw) : null;
  }
  const list = await getWpClient().json<RawPost[]>(
    `/wp/v2/posts?slug=${encodeURIComponent(idOrSlug)}&_fields=id,slug,date_gmt,link,title,excerpt`,
  );
  if (!list || !Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first ? toPost(first) : null;
}
