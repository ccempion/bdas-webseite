import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

/**
 * Blog routes are flag-gated until the module is acceptance-complete (rule 6).
 * Flip BDAS_FLAG_BLOG=true to preview.
 */
export function requireBlogFlag(): void {
  if (!isFlagOn("blog")) notFound();
}

/**
 * Comments ride the blog module but ship behind their own flag: `blog` is
 * already on in production, so without this a merge would switch comments on
 * federation-wide (ADR 0033). Unlike `requireBlogFlag`, this returns a boolean
 * — a post page still renders fine with the comments region absent.
 */
export function commentsEnabled(): boolean {
  return isFlagOn("blog") && isFlagOn("blog_comments");
}
