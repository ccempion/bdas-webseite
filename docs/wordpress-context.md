# WordPress Context

> Reference file for AI builders. Describes the existing WordPress install that the BDAS app integrates with. WordPress is already set up; this file is read-only context, not a build target.

---

## 1. Hosting and Access

- **Public domain:** `<bdas.de>`
- **Admin URL:** `<https://bdas.de/wp-admin>`
- **Hosting provider:** `<e.g. All-Inkl, Hetzner, Strato, ...>`
- **SSH access:** `<yes / no — host + path if yes>`
- **WP-CLI available on server:** `<yes / no>`
- **WordPress version:** `<6.x>`
- **PHP version:** `<8.x>`

---

## 2. REST API

- **Base URL:** `<https://bdas.de/wp-json/wp/v2>`
- **Public endpoints used by `content-bridge` module:**
  - `GET /posts` — blog posts
  - `GET /pages` — static pages
  - `GET /categories` — for filtering posts by group
- **Authentication for read access:** none (public REST API)
- **CORS:** must allow `https://bdas.de` and `https://dashboard.bdas.de` as origins. Add via plugin or `.htaccess` if not already configured.

---

## 3. Theme

- **Active theme name:** `<theme-slug>`
- **Theme author:** `<own / vendor / Astra / GeneratePress / ...>`
- **Custom theme repository:** `<URL or "n/a — purchased theme">`
- **Should the app's design tokens (`core/design-system`) be mirrored into the theme?** `<yes / no>`
  - If yes: tokens are exported as a CSS file from `core/design-system` and enqueued by the theme via `wp_enqueue_style`.

---

## 4. Categories Used for Local Groups

The SSO plugin restricts each local-board author to a specific WordPress category. List the category slug for each Hochschulgruppe so the plugin can map `local_board:[group_slug]` → category.

| Group slug (in app) | WP category slug | WP category ID |
|---------------------|------------------|----------------|
| `moenchengladbach`  | `mg-blog`        | `<id>`         |
| `aachen`            | `ac-blog`        | `<id>`         |
| `duesseldorf`       | `dd-blog`        | `<id>`         |
| ...                 | ...              | ...            |

**Federal posts** go to category: `<bundesblog>` (no group prefix).

---

## 5. Existing Plugins (relevant ones only)

List plugins already installed that the app might collide or interact with. Skip purely cosmetic plugins.

| Plugin | Purpose | Keep / Remove / Replace |
|--------|---------|-------------------------|
| `<e.g. WPML>` | Multi-language | keep |
| `<e.g. Yoast SEO>` | SEO | keep |
| `<e.g. WPForms>` | Forms | replace once app forms exist |
| ...    | ...     | ...                     |

---

## 6. Users in WordPress Today

- **Number of existing WP users:** `<n>`
- **Will they be migrated into the app's `auth_users` table?** `<no — boards re-onboard via app registration>`
- **After SSO plugin install, can existing WP-only logins still work?** `<no — WP password login is disabled in favor of SSO>`

---

## 7. Constraints

- **Pages or URLs the app must NOT touch:** `<list paths, e.g. /impressum, /datenschutz>`
- **Existing custom post types or shortcodes the app should preserve:** `<list or "none">`
- **Cron / background jobs already scheduled in WP:** `<list or "none">`

---

## 8. Domains and Cookie Scope

- **Public site:** `https://bdas.de`
- **App (dashboard):** `https://dashboard.bdas.de`
- **SSO cookie domain:** `.bdas.de` (covers both)
- **DNS managed at:** `<provider>`
- **TLS certificates:** `<Let's Encrypt via host / Cloudflare / ...>`

---

## 9. Things the LLM Should Assume

- WordPress is a black box: read via REST API, write only via the SSO plugin's role mapping.
- The LLM never edits theme files, never writes posts, never touches the database directly.
- Any UI inside WordPress (admin views, theme tweaks) is **out of scope** for the LLM unless explicitly added to a build prompt.
- Content authoring (blog posts, marketing copy) is a parallel workstream done by humans inside WP admin.

---

## 10. Open Items

- `<list anything not yet decided that the LLM might ask about>`
