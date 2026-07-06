import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
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
