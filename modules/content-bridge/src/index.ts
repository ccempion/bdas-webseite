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
} from "./client.js";
export { getMenu } from "./services/menu.js";
export { listPosts, getPost } from "./services/posts.js";
export { getPage } from "./services/pages.js";
export type { Menu, MenuItem, Post, Page } from "./types.js";
