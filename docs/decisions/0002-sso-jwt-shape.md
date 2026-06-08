# ADR 0002 — SSO JWT Shape

- **Status:** Accepted (amended 2026-05-17; cross-domain scheme superseded by ADR 0009)
- **Date:** 2026-05-10
- **Supersedes:** —
- **Superseded by:** ADR 0009 — _cross-domain cookie scheme only._ The JWT shape, signing, and claims here are retained; the `.bdas.de` cookie scope and the WordPress-verifier premise are void. The cookie is now host-only and internal to the app.

## Context

The platform spec (§7, §16) requires single sign-on between the Next.js apps (`apps/web`, `apps/dashboard`) and the existing WordPress site at `bdas.de`. The agreed mechanism is a signed cookie set by the Next.js issuer on the parent domain `.bdas.de` and read by a small WordPress plugin at `wp-plugin/bdas-sso`.

The cookie's contents — a JWT — is the load-bearing wall of the federation's identity flow. Once the shape ships, changing it requires:

- Re-signing every active session (forced re-login).
- Releasing a new WordPress plugin version on every WP host the federation runs.
- Coordinating the rollout window so issuer and verifier are not on different shapes simultaneously.

The build plan calls this out (`docs/build-plan.md` §5) as one of the highest-blast-radius decisions in Phase 1. This ADR locks it before any auth code is written.

The decision affects:

- Which JWT claims the issuer puts in and the WordPress plugin can rely on.
- Cookie attributes (name, domain, path, security flags, lifetime).
- The signing algorithm and where the key lives.
- How future schema changes are rolled out without forcing a flag-day.

## Decision

### Payload claims

```json
{
  "iss": "bdas",
  "sub": "mem_<nanoid>",
  "email": "user@example.de",
  "roles": ["member"],
  "ver": 1,
  "iat": 1715300000,
  "exp": 1715904800,
  "jti": "ses_<nanoid>"
}
```

| Claim   | Type     | Required | Meaning                                                                                                                                       |
| ------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `iss`   | string   | yes      | Always `"bdas"`. Verifier rejects anything else.                                                                                              |
| `sub`   | string   | yes      | The BDAS user id (`mem_<nanoid>` per `core/id`). Stable across the user's lifetime.                                                           |
| `email` | string   | yes      | The verified primary email. Lowercased. Carried in the token so the WP plugin does not need a REST round-trip on every page load.             |
| `roles` | string[] | yes      | Subset of `member \| local_board \| federal_board \| alumnus`. Empty array is allowed (e.g., a verified-but-pending member).                  |
| `ver`   | integer  | yes      | Token-shape schema version. Phase 1 ships `1`. Verifier accepts only `ver` values it knows about; unknown `ver` → reject and force re-login.  |
| `iat`   | number   | yes      | Issued-at (Unix seconds). Standard JWT.                                                                                                       |
| `exp`   | number   | yes      | Expiry (Unix seconds). Default 7 days from `iat`.                                                                                             |
| `jti`   | string   | yes      | Server-side session id (`ses_<nanoid>`). Persisted in the `auth_sessions` table so individual sessions can be revoked without rotating `kid`. |

`nbf`, `aud`, and `azp` are intentionally not used in v1 — re-evaluate if/when a third-party verifier joins.

### Cookie envelope

| Attribute  | Production               | Development          |
| ---------- | ------------------------ | -------------------- |
| `Name`     | `bdas_session`           | `bdas_session`       |
| `Domain`   | `.bdas.de`               | _unset_              |
| `Path`     | `/`                      | `/`                  |
| `HttpOnly` | `true`                   | `true`               |
| `Secure`   | `true`                   | `false`              |
| `SameSite` | `Lax`                    | `Lax`                |
| `Max-Age`  | `604800` (7 days, fixed) | `604800` (7 days)    |
| Rolling?   | No (Phase 1)             | No                   |
| Set by     | `apps/web` Server Action | `apps/web` dev route |
| Cleared by | logout / verify failure  | logout               |

`SameSite=Lax` (not `Strict`) so the WordPress site can navigate to the Next.js apps and back without losing the cookie.

The cookie carries the JWT directly (no opaque-token indirection in v1). The `jti` claim plus the `auth_sessions` table give us per-session revocation without needing a server-side cookie store.

### Signing

- Algorithm: **HS256** (symmetric).
- Secret: `SSO_JWT_SECRET` env var on both sides — already in `.env.example` and documented to be the same value in `apps/web` and the WordPress plugin's `wp-config.php`.
- Key length: ≥ 32 bytes of entropy; `openssl rand -base64 32` is the documented generator.
- The secret is rotated only via `kid` (see follow-up); never silently swapped.

### Versioning and forward compatibility

- `ver: 1` is mandatory and strict. Any token without `ver`, or with a `ver` the verifier doesn't know, is rejected.
- Adding a claim is a `ver` bump. The new issuer emits `ver: 2`; the verifier accepts both `1` and `2` for the rollout window; once all in-flight tokens are `ver: 2`, drop `1` support in a follow-up release.
- Removing or renaming a claim is also a `ver` bump and follows the same dual-accept rollout.
- The verifier MUST treat `ver` mismatch as "force re-login" rather than "deny access" — the user shouldn't see a 401, just a redirect to `/anmelden`.

### What goes where

- The Next.js issuer lives in the `auth` module at `modules/auth/src/sso.ts`. It mints, verifies, and rotates tokens.
- The verifier in `wp-plugin/bdas-sso` is a thin PHP plugin that reads the cookie, calls a JWT-HS256 verify, and hydrates `wp_set_current_user` based on `sub` (mapping `sub` to a WordPress user via a custom user-meta lookup created on first SSO login).
- Role mapping (BDAS roles → WP roles) is **not** part of the v1 JWT shape. WP plugin v1 only does "logged in vs not." Role-aware WP behavior is Phase 5 (spec §16) and a future ADR.

## Alternatives considered

### RS256 (asymmetric) instead of HS256

Public-key signing means the WordPress plugin only carries the public key, while the private key stays in the Next.js apps. Lower blast radius if the WP host is compromised.

**Rejected for v1** because both issuer and verifier are operated by the same federation, and HS256 requires fewer moving parts (one secret, one library on each side). If a third-party verifier ever needs to validate the cookie, the future ADR can supersede this.

### Opaque session token + server lookup

The cookie carries only `ses_<nanoid>`; the verifier hits an HTTP endpoint to resolve the session. No claims in the cookie at all.

**Rejected for v1** because every WordPress page load would issue a network call to `apps/web`, doubling the latency budget for the public site and tying WordPress availability to the Next.js app being up. Server-side revocation is already covered by the `jti` claim plus the `auth_sessions` table.

### Putting `name` and other profile fields in the token

Saves a WP REST round-trip when WP needs to display the username.

**Rejected** because profile fields drift (a member updates their name, but the cookie still says the old one for up to 7 days). `email` is in the token because it changes rarely and the WP plugin needs it for user matching; everything else WP can fetch via REST when it needs to render a profile.

### Rolling cookie expiry (slide forward on each request)

Keeps active users logged in indefinitely.

**Deferred to Phase 1 acceptance.** The simpler fixed-7-day window ships first; if the federation reports too-frequent re-logins, re-evaluate. Rolling expiry is implementable without changing the JWT shape — it's an issuer behavior, not a claim.

## Consequences

### Positive

- The WordPress plugin can verify a request locally with one HMAC operation and a clock check — no network call, no DB hit.
- Per-session revocation works (via `jti` + `auth_sessions`) without the cookie growing or rotating.
- The `ver` claim provides a clean evolution path so future shape changes don't need a flag-day.
- Email is carried in the token, so the WP plugin's first-use experience is fast.

### Negative

- Symmetric signing means a WordPress-host compromise leaks the secret, allowing forged tokens until the secret is rotated. Mitigation: documented rotation runbook (follow-up below) and short-ish `exp` (7 days).
- A user whose role is changed (promotion to `local_board`, demotion from `federal_board`) keeps the old roles in their cookie until it expires. Mitigation: privileged actions in the dashboard re-check roles via the database, not the cookie. The cookie's role list is a hint, not the authority.
- `email` in the token is mild PII that ends up in browser cookies. It's already present in the URL path of email-verification links, so the marginal exposure is small.

### Privacy

The cookie contains `email` and `sub`. Both are HttpOnly and not exposed to client JS. The DSGVO record-of-processing entry for sessions must list these fields. No further PII.

## Follow-ups

- Document the secret rotation runbook before Phase 1 production launch: how to rotate `SSO_JWT_SECRET` without forcing all users out at once (issuer accepts old + new for a window, then drops old). Capture as ADR 0003 if it ends up complex.
- Once `wp-plugin/bdas-sso` is implemented (Sprint 4), pin the JWT library version on the WP side and add an integration test that issues a token from `apps/web` and verifies it through the plugin's parser, against a known fixture.
- After Phase 1 acceptance, revisit rolling expiry. If kept fixed, document why.
- After Phase 5 (role-aware WP), add an ADR for the `roles` → WP-role mapping. Until then, WP only differentiates "logged in" vs "anonymous".

## Amendment — 2026-05-17

Verification of the implemented SSO bridge against this ADR surfaced two points where the original text and the shipped code disagree. This amendment reconciles them. Per CLAUDE.md §8, the most recent ruling wins on conflict, so the statements here supersede the conflicting passages above.

### 1. WordPress user mapping is by `email`, not `sub`

The "What goes where" section says the plugin hydrates `wp_set_current_user` "based on `sub` (mapping `sub` to a WordPress user via a custom user-meta lookup created on first SSO login)." The shipped `wp-plugin/bdas-sso/src/sso.php` instead matches on the token's `email` claim via `get_user_by('email', …)` and auto-provisions a low-privilege Subscriber on first match.

**Decision: email-based mapping is the accepted Phase 1 mechanism.** It is simpler, needs no extra user-meta write path, and is sufficient for the Phase 1 goal of "logged in vs not." `email` is already a required, lowercased, verified claim (it exists in the token precisely so WP avoids a REST round-trip), so it is a sound join key.

**Accepted caveat:** if a member changes their primary email in BDAS, the next SSO request will not match the original WP user and will provision a _new_ Subscriber; the old WP user is orphaned. Likewise, if a WP account with that email already exists from some other flow, SSO adopts it. This is tolerable in Phase 1 (WP users carry no BDAS-side state beyond the Subscriber shell). Revisit when Phase 5 introduces role-aware WP: a durable `sub`→WP-user link (the originally-specified user-meta lookup) should be added then, keyed on the immutable `sub` rather than the mutable `email`. Tracked as a Phase 5 follow-up.

### 2. `sub` carries the `usr_` prefix, not `mem_`

The payload example shows `"sub": "mem_<nanoid>"`. The issuer (`modules/auth/src/sso.ts` via `login`) sets `sub` to `auth_users.id`, which is a `usr_<nanoid>` id from `core/id`; the `@bdas/auth` README documents `sub=usr_…`. The implementation and README are correct; the ADR example was wrong.

**Correction:** `sub` is the `auth` user id, `usr_<nanoid>`. It is stable for the user's lifetime, which is the property `sub` consumers (Phase 3 dashboard) require. The `mem_<nanoid>` in the original payload example should be read as `usr_<nanoid>`.
