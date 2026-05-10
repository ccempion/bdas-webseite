# `@bdas/content-bridge`

Read-only typed client for the WordPress REST API at `bdas.de`. The
boundary is fixed in [ADR 0004](../../docs/decisions/0004-content-bridge.md).

## What this module does

| Service                 | Endpoint                                                      | Purpose                                                |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `getMenu()`             | `GET /wp-json/bdas/v1/menu` (custom, in `wp-plugin/bdas-sso`) | Primary navigation for the dashboard SiteHeader        |
| `listPosts({ limit? })` | `GET /wp-json/wp/v2/posts`                                    | Latest news for the dashboard homepage                 |
| `getPost(idOrSlug)`     | `GET /wp-json/wp/v2/posts/...`                                | Individual post (deep-link)                            |
| `getPage(slug)`         | `GET /wp-json/wp/v2/pages?slug=...`                           | Page body, used if a group profile pulls intro from WP |

All consumers see the typed domain shapes (`Menu`, `Post`, `Page`) — never the raw WP REST objects.

## Caching and failure behaviour

- All requests pass `next: { revalidate: 3600 }`. Under Next.js, that's a 1-hour data cache; under plain Node it's ignored and you get a normal fetch.
- If WordPress is unreachable, returns 5xx, or returns malformed JSON, the bridge **never throws**. `getMenu()` returns `{ items: [] }`; `listPosts()` returns `[]`; single-resource getters return `null`. App pages must render usefully when this happens (see SiteHeader's empty state).

## Composition

`apps/web` injects the WP base URL via `WORDPRESS_REST_BASE_URL` env (default `https://bdas.de`). Tests use `setWpClient(new WpClient({ baseUrl, fetcher }))` with an injected fetcher.

## Public surface

```ts
import {
  getMenu,
  listPosts,
  getPost,
  getPage,
  WpClient,
  setWpClient,
  resetWpClient,
  type Menu,
  type MenuItem,
  type Post,
  type Page,
} from "@bdas/content-bridge";
```
