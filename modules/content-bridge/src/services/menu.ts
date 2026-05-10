/**
 * Primary navigation, fetched from the SSO plugin's custom endpoint
 * `/wp-json/bdas/v1/menu`. Returns an empty menu (not null, not throw)
 * when the endpoint is missing or WP is down — the dashboard must still
 * render.
 */
import { getWpClient } from "../client";
import type { Menu, MenuItem } from "../types";

type RawMenuItem = {
  id?: number;
  title?: string;
  url?: string;
  slug?: string;
  parent?: number;
  order?: number;
};

type RawMenuResponse = {
  items?: RawMenuItem[];
};

const EMPTY: Menu = { items: [] };

export async function getMenu(): Promise<Menu> {
  const raw = await getWpClient().json<RawMenuResponse>("/bdas/v1/menu");
  if (!raw || !Array.isArray(raw.items)) return EMPTY;

  const items: MenuItem[] = [];
  for (const r of raw.items) {
    if (typeof r.id !== "number" || typeof r.title !== "string" || typeof r.url !== "string") {
      continue;
    }
    items.push({
      id: r.id,
      title: r.title,
      url: r.url,
      slug: typeof r.slug === "string" ? r.slug : slugFromUrl(r.url),
      parentId: typeof r.parent === "number" ? r.parent : 0,
      order: typeof r.order === "number" ? r.order : 0,
    });
  }
  items.sort((a, b) => a.order - b.order || a.id - b.id);
  return { items };
}

function slugFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    return seg[seg.length - 1] ?? "";
  } catch {
    return "";
  }
}
