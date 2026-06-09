ADR 0004 locks the WP integration boundary: read-only, 1-hour revalidate, never throw on outage,
three endpoints (bdas/v1/menu, wp/v2/posts, wp/v2/pages).

@bdas/content-bridge

- WpClient thin REST wrapper. Uses Next 14's revalidate: 3600, falls back to plain fetch elsewhere,
  returns null on any failure.
- Services: getMenu(), listPosts({limit?}), getPost(idOrSlug), getPage(slug). All return safe
  defaults on outage (empty array / null).
- HTML stripped + basic German entity decoding for post titles/excerpts.
- 9 unit tests with an injected fetcher — covers happy path, 404, 5xx, transport error, malformed  
  shapes.

wp-plugin/bdas-sso (PHP)

- bdas-sso.php plugin entry; loads src/jwt.php, src/sso.php, src/menu.php.
- HS256 JWT verifier with constant-time signature comparison; rejects alg:none, wrong issuer, wrong
  ver, expired tokens.
- Cookie reader hydrates wp_set_current_user; auto-creates a subscriber-role WP user on first SSO  
  match by email.
- /wp-json/bdas/v1/menu REST endpoint resolving the primary nav (theme location → named menu → most
  recent), normalised to the JSON shape the bridge expects.
- README documents install (zip + Upload Plugin), the BDAS_SSO_SECRET runbook, and verification  
  steps.

apps/web

- <SiteHeader /> server component: fetches menu via the bridge, renders the WP nav as the desktop  
  pill nav-strip per the visual language. Empty-state when WP is down: just the BDAS logo + a "Zur  
  Hauptseite" link.
- Mounted in the root layout — every page now has the unified header.
- Homepage adds an "Aktuelles" section pulling 3 latest WP posts (gated on
  BDAS_FLAG_CONTENT_BRIDGE).
- Cookie domain wiring already supported SSO_COOKIE_DOMAIN; .env.example updated to call out  
  .bdas.de for production.

Gates: typecheck across 14 workspaces clean, lint exit 0, prettier clean, 57/57 tests passing (with
Postgres up: 7 auth + 5 groups + 5 members + 9 content-bridge + 31 unit).

Phase 1 acceptance loop is now complete: register → verify → login → fill profile → board approves
→ browse groups → cross-domain SSO between dashboard.bdas.de and bdas.de with shared nav.

When you're ready to ship, the deploy steps are:

1. Vercel project for apps/web → CNAME dashboard.bdas.de.
2. Generate SSO_JWT_SECRET; paste into Vercel env + WP wp-config.php (BDAS_SSO_SECRET).
3. Set SSO_COOKIE_DOMAIN=.bdas.de and PUBLIC_SITE_URL=https://dashboard.bdas.de on Vercel.
4. Zip wp-plugin/bdas-sso/ → upload via wp-admin → activate.
5. Set BDAS_FEDERAL_BOARD_EMAILS=cem.colak@bdas.de so you can approve the first member.

Want me to keep going to Sprint 5 (acceptance pass — German strings audit, cookie banner, GDPR  
 consent on register, data-export stub, Lighthouse pass)?

%%%%%%%%%%do I do the deploy steps? currently i'm on vercel and creating the project. Should I just link the
repository to it and don't change the root directly, application preset(defalut is "other")%%%%%%%%%%%%%%%

⏺ Don't accept the defaults — two things to change before linking, plus env vars to set before the
first deploy.

In the Vercel project settings

Root Directory: apps/web

That's the load-bearing one. Without it, Vercel looks at the repo root, sees no Next.js, and falls
over. Click "Edit" next to Root Directory, type apps/web. Don't tick "Include source files outside
of the Root Directory" — Vercel auto-handles pnpm workspaces when it sees pnpm-workspace.yaml.

Framework Preset: should auto-flip to Next.js the moment you set the root directory. If it doesn't,
pick it manually.

Build / Install / Output commands: leave default. The repo's packageManager: pnpm@11.0.9 makes  
 Vercel use pnpm correctly.

Node version: 20.x (default is fine).

Environment variables (Settings → Environment Variables) — set these before first deploy

The app reads from process.env at runtime; without these, deployed pages will throw the moment they
hit auth or DB code.

DATABASE_URL # Supabase Postgres URI — you don't have this yet
SSO_JWT_SECRET # `openssl rand -base64 32`, same value as wp-config.php  
 SSO_COOKIE_DOMAIN # .bdas.de  
 PUBLIC_SITE_URL # https://dashboard.bdas.de  
 WORDPRESS_REST_BASE_URL # https://bdas.de  
 BDAS_FEDERAL_BOARD_EMAILS # cem.colak@bdas.de  
 BDAS_FLAG_AUTH # true  
 BDAS_FLAG_GROUPS # true  
 BDAS_FLAG_MEMBERS # true  
 BDAS_FLAG_CONTENT_BRIDGE # true  
 RESEND_API_KEY # later, when you create a Resend account
RESEND_FROM_EMAIL # later

You can deploy without DATABASE_URL and RESEND_API_KEY and the build will succeed, but any page  
 that touches auth/account/groups will 500 at request time. So really, don't push deploy until  
 Supabase is set up.

What's next, in order

1. Finish the Vercel project setup (root + preset).
2. Create a Supabase project — copy the connection string into DATABASE_URL. Run pnpm db:migrate
   against it once locally with that DATABASE_URL exported, to push the auth/groups/members schemas.
3. Run pnpm groups:seed against the Supabase URL too so production has the Aachen entry.
4. Generate the SSO secret, paste into Vercel env + wp-config.php.  
   RESEND_FROM_EMAIL # later

You can deploy without DATABASE_URL and RESEND_API_KEY and the build will succeed, but any page
that touches auth/account/groups will 500 at request time. So really, don't push deploy until
Supabase is set up.

What's next, in order

1. Finish the Vercel project setup (root + preset).
2. Create a Supabase project — copy the connection string into DATABASE_URL. Run pnpm db:migrate
   against it once locally with that DATABASE_URL exported, to push the auth/groups/members schemas.
3. Run pnpm groups:seed against the Supabase URL too so production has the Aachen entry.
4. Generate the SSO secret, paste into Vercel env + wp-config.php.
5. Zip and upload the WP plugin.
6. Click Deploy.
