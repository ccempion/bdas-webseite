import { renderPostContentHtml, type PostSummary } from "@bdas/blog";

/** Wire shape passed from the server component to the card markup. */
export type AktuellesItem = {
  readonly id: string;
  readonly title: string;
  readonly teaser: string;
  readonly publishedAt: Date;
  readonly href: string;
};

const TEASER_MAX_LEN = 160;

/** Strip tags from rendered post HTML and truncate to a short plain-text
 *  teaser, breaking on a word boundary where possible. */
export function extractTeaser(html: string, maxLen = TEASER_MAX_LEN): string {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Map a public blog post to the landing card's wire shape. */
export function toAktuellesItem(post: PostSummary): AktuellesItem {
  return {
    id: post.id,
    title: post.title,
    teaser: extractTeaser(renderPostContentHtml(post.content)),
    publishedAt: post.createdAt,
    href: `/blog/${post.slug}`,
  };
}
