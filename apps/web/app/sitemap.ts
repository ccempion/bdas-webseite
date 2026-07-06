import type { MetadataRoute } from "next";

import { getDb } from "@bdas/db";
import { ANON, listUpcomingEvents } from "@bdas/events-module";
import { isFlagOn } from "@bdas/feature-flags";
import { listGroups } from "@bdas/groups";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  const url = (p: string) => `${base}${p}`;

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url("/ueber-uns"), changeFrequency: "monthly" },
    { url: url("/ueber-uns/verbandsstruktur"), changeFrequency: "monthly" },
    { url: url("/ueber-uns/bdaj"), changeFrequency: "monthly" },
    { url: url("/unsere-arbeit"), changeFrequency: "monthly" },
  ];

  const db = getDb();
  if (isFlagOn("groups")) {
    entries.push({ url: url("/gruppen"), changeFrequency: "weekly" });
    const groups = await listGroups(db, { status: "active" });
    entries.push(...groups.map((g) => ({ url: url(`/gruppen/${g.slug}`) })));
  }
  if (isFlagOn("events")) {
    entries.push({ url: url("/events"), changeFrequency: "daily" });
    const events = await listUpcomingEvents(db, ANON);
    entries.push(...events.map((e) => ({ url: url(`/events/${e.id}`) })));
  }
  return entries;
}
