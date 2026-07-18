/**
 * URL guard for board-authored links. Accepts only http(s), site-relative
 * ("/…") and in-page ("#…") hrefs; everything else (javascript:, data:,
 * mailto:, protocol-relative, malformed) is rejected. Returns the original
 * (trimmed) string so authored URLs are preserved verbatim.
 */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** True for absolute http(s) URLs — these get rel/target on render. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
