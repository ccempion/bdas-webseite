import { getWpClient } from "../client";
import type { Page } from "../types";

type RawPage = {
  id?: number;
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
};

function toPage(r: RawPage): Page | null {
  if (
    typeof r.id !== "number" ||
    typeof r.slug !== "string" ||
    typeof r.link !== "string" ||
    !r.title?.rendered
  ) {
    return null;
  }
  return {
    id: r.id,
    slug: r.slug,
    title: r.title.rendered,
    contentHtml: r.content?.rendered ?? "",
    link: r.link,
  };
}

export async function getPage(slug: string): Promise<Page | null> {
  const list = await getWpClient().json<RawPage[]>(
    `/wp/v2/pages?slug=${encodeURIComponent(slug)}&_fields=id,slug,link,title,content`,
  );
  if (!list || !Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  return first ? toPage(first) : null;
}
