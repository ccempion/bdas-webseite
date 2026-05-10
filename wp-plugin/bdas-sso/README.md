# BDAS SSO Bridge — WordPress Plugin

Two responsibilities:

1. **SSO** — read the `bdas_session` cookie issued by `dashboard.bdas.de`, verify it (HS256, ADR 0002), and call `wp_set_current_user` so themes/widgets see the BDAS member as logged-in. Auto-creates a low-privilege Subscriber on first match.
2. **Nav endpoint** — expose the primary navigation as JSON at `/wp-json/bdas/v1/menu`. Consumed by `@bdas/content-bridge` to render the dashboard's SiteHeader.

## Install

The plugin has no Composer / build step. Two options:

### Via wp-admin (preferred — you have upload access)

1. Zip the `wp-plugin/bdas-sso/` directory:
   ```bash
   cd wp-plugin && zip -r bdas-sso.zip bdas-sso
   ```
2. WP-admin → Plugins → Add New → **Upload Plugin** → choose `bdas-sso.zip` → Install.
3. Activate.

### Via FTP/SSH

Copy the `wp-plugin/bdas-sso` directory into `wp-content/plugins/` on the WP host. Activate from wp-admin.

## Configure the shared secret

Both sides must use the same secret.

```bash
openssl rand -base64 32
# copy the output
```

Add to `.env.local` (Next app) and `.env` in production env:

```
SSO_JWT_SECRET=<paste>
```

Add to `wp-config.php` on the WordPress host, **above** the `/* That's all, stop editing! */` line:

```php
define('BDAS_SSO_SECRET', '<paste>');
```

The values must be **byte-for-byte identical**. ≥ 32 characters; the plugin refuses to verify if shorter.

If `BDAS_SSO_SECRET` is missing or empty, the plugin loads but does nothing — anonymous WP traffic continues working normally. Failing closed (no forged sessions) by design.

## Verify it works

1. Log into `dashboard.bdas.de`.
2. Open `bdas.de/wp-admin` (or any WP page with a "logged in as" widget). You should be recognised.
3. Visit `https://bdas.de/wp-json/bdas/v1/menu` directly — you should see a JSON object `{ "items": [...] }`.

If the menu endpoint returns `{ "items": [] }` despite the WP site having a nav, check that a menu is assigned to the `primary` theme location, or rename the menu to `Primary` / `Hauptmenü` / `Navigation`. Resolution rules are in `src/menu.php`.

## What the plugin does NOT do (yet)

- Map BDAS roles to WP roles. Phase 5; future ADR.
- Issue WordPress's own auth cookie. The plugin only sets the in-request user — it doesn't persist a WP session. Each WP page load re-verifies the BDAS cookie. (Logging out at `dashboard.bdas.de` immediately makes the user anonymous on `bdas.de` too.)
- Sync profile fields back to WP (display name, etc.). The auto-created Subscriber starts with the email-derived username and a random password.

## Files

```
wp-plugin/bdas-sso/
├── bdas-sso.php       # plugin entry, hook registration
├── src/
│   ├── jwt.php        # HS256 verifier (no third-party libs)
│   ├── sso.php        # cookie reader + user hydration
│   └── menu.php       # /wp-json/bdas/v1/menu endpoint
├── package.json       # workspace marker (no Node code)
└── README.md          # this file
```

## Security notes

- Algorithm-confusion (`alg:none`) is rejected.
- Constant-time signature comparison via `hash_equals`.
- Issuer (`iss=bdas`) and version (`ver=1`) are strict.
- Auto-provisioned WP users get `subscriber` role only — no admin capabilities.
- `wp-admin` traffic is left alone; the plugin only hydrates frontend / REST requests.
- The plugin does NOT call `wp_set_auth_cookie`; revoking the dashboard session immediately ends the WP session on the next request.
