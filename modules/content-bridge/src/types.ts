/** Domain types — the shape `apps/web` sees, decoupled from WP REST internals. */

export type MenuItem = {
  readonly id: number;
  readonly title: string;
  /** Absolute URL on bdas.de — used as `href`. */
  readonly url: string;
  /** Slug stripped from the URL, useful for active-link comparison. */
  readonly slug: string;
  /** 0 for top-level. */
  readonly parentId: number;
  /** Author-defined sort key. */
  readonly order: number;
};

export type Menu = {
  readonly items: ReadonlyArray<MenuItem>;
};

export type Post = {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  /** Plain-text excerpt; HTML stripped. */
  readonly excerpt: string;
  readonly link: string;
  readonly publishedAt: Date;
};

export type Page = {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  /** Raw HTML body. Sanitized on render, not here. */
  readonly contentHtml: string;
  readonly link: string;
};
