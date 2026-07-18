/**
 * URL guard for board-authored links. Accepts only http(s), site-relative
 * ("/…") and in-page ("#…") hrefs; everything else (javascript:, data:,
 * mailto:, protocol-relative, backslash/control-char smuggling, malformed) is
 * rejected. Returns the original (trimmed) string so authored URLs are
 * preserved verbatim.
 */
export function safeHref(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  // Browsers strip ASCII tab/newline/CR and treat "\" as "/" when resolving an
  // href, which can smuggle a protocol-relative target past the checks below.
  if (/[\t\n\r\\]/.test(v)) return null;
  if (v.startsWith("//")) return null;
  if (v.startsWith("/") || v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/** True for absolute http(s) URLs — these get rel/target on render. Uses the
 *  same parser as safeHref so the two never disagree. */
export function isExternalHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return false;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
