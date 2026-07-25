const GROUP_PAGE_RE = /^gruppen\/([a-z0-9-]+)$/;

/** The group slug a content slug belongs to (`gruppen/<slug>`), or null for
 *  federal pages. Group pages are authorized per group (ADR 0026). */
export function groupPageSlug(contentSlug: string): string | null {
  return GROUP_PAGE_RE.exec(contentSlug)?.[1] ?? null;
}
