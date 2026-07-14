/** News feed contract for the landing's Aktuelles block. The blog module
 *  (issue #50) later ships the real implementation; the landing consumes
 *  only this interface (spec §4.3). */
export type NewsItem = {
  readonly id: string;
  readonly title: string;
  readonly teaser: string;
  readonly publishedAt: Date;
  /** null = not clickable (placeholder era: no blog detail pages yet). */
  readonly href: string | null;
};

export type NewsSource = {
  listLatest(n: number): Promise<ReadonlyArray<NewsItem>>;
};

/** Manual announcements until the blog module exists. The board can edit
 *  this array; an empty array hides the Aktuelles block entirely. */
const PLACEHOLDER_ITEMS: ReadonlyArray<NewsItem> = [
  {
    id: "platzhalter-3",
    title: "BDAS-Connect geht an den Start",
    teaser: "Unsere neue Plattform für Mitglieder: Events, Dateien und dein Netzwerk.",
    publishedAt: new Date("2026-07-01"),
    href: null,
  },
  {
    id: "platzhalter-2",
    title: "Bundeskonferenz 2026",
    teaser: "Die Hochschulgruppen kommen zusammen — Rückblick folgt.",
    publishedAt: new Date("2026-06-15"),
    href: null,
  },
  {
    id: "platzhalter-1",
    title: "Neue Hochschulgruppen im BDAS",
    teaser: "Der Verband wächst: neue Gruppen an weiteren Standorten.",
    publishedAt: new Date("2026-05-20"),
    href: null,
  },
];

export const placeholderNewsSource: NewsSource = {
  listLatest: (n) =>
    Promise.resolve(
      [...PLACEHOLDER_ITEMS]
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, n),
    ),
};
