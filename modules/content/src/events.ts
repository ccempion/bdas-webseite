/**
 * Events emitted by the content module. Subscribers depend on the types,
 * not on the producing services. (CLAUDE.md §3.)
 */

export type ContentPageSaved = {
  readonly type: "content.page.saved";
  readonly slug: string;
  readonly updatedBy: string;
  readonly at: Date;
};

export type ContentEvent = ContentPageSaved;
