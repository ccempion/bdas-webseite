import type { MetadataRoute } from "next";

import { isStaging } from "../lib/staging";

export default function robots(): MetadataRoute.Robots {
  if (isStaging()) return { rules: { userAgent: "*", disallow: "/" } };
  const base = process.env["PUBLIC_SITE_URL"] ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/federal", "/gruppe", "/account", "/dateien", "/admin", "/api", "/dashboard"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
