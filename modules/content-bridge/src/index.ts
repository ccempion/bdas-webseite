/**
 * @bdas/content-bridge — public surface.
 *
 * Read-only WP integration. Per ADR 0004: no writes, 1h revalidate,
 * graceful empty/null on outage.
 */

export {
  WpClient,
  getWpClient,
  setWpClient,
  resetWpClient,
  type Fetcher,
  type WpClientOptions,
} from "./client";
export { getMenu } from "./services/menu";
export { listPosts, getPost } from "./services/posts";
export { getPage } from "./services/pages";
export type { Menu, MenuItem, Post, Page } from "./types";
