# `@bdas/auth`

Identity, authentication, sessions. Per CLAUDE.md §1 the auth module owns its
tables and other modules talk to it only through this README's listed surface.

## Owned tables

| Table                      | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `auth_users`               | Identity row: id, normalized email, status (`unverified` / `active`) |
| `auth_credentials`         | Argon2id password hash + algorithm tag (split from users)            |
| `auth_sessions`            | Server-side sessions; `id` is the JWT `jti` (ADR 0002)               |
| `auth_email_verifications` | Single-use verification tokens (24 h)                                |
| `auth_password_resets`     | Single-use reset tokens (1 h)                                        |
| `auth_rate_limits`         | Fixed-window counters per key                                        |

Migrations: `migrations/0001_init.sql`. Discovered by `infra/migrations` per
the manifest order (auth runs first; everything FKs into `auth_users`).

## Public surface

```ts
import {
  // Read-side
  getCurrentUser,
  requireRole,
  // Auth flows
  register,
  verifyEmail,
  login,
  logout,
  requestPasswordReset,
  completePasswordReset,
  changePassword,
  ChangePasswordInput,
  // SSO cookie
  COOKIE_NAME,
  COOKIE_MAX_AGE_SECONDS,
  // URL builders for the Notifier
  buildVerifyUrl,
  buildResetUrl,
  // Composition
  setNotifier,
  createResendNotifier,
  // Types
  type CurrentUser,
  type Role,
  type SsoClaims,
  type AuthEvent,
} from "@bdas/auth";
```

Anything not re-exported from `src/index.ts` is private (CLAUDE.md §1 rule 8).

## Events

The module publishes typed events through `core/events`:

- `auth.user.registered`
- `auth.user.verified`
- `auth.user.logged_in`
- `auth.user.logged_out`
- `auth.password.reset`
- `auth.password.changed`

Subscribers should depend on `AuthEvent` (or its arms) and not on any auth
service directly.

## Composition (in `apps/web`)

```ts
// apps/web/lib/auth-bootstrap.ts
import { setNotifier, createResendNotifier, consoleNotifier } from "@bdas/auth";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;
setNotifier(apiKey && from ? createResendNotifier({ apiKey, from }) : consoleNotifier);
```

## Session cookie (ADR 0002, as amended by ADR 0009)

- Name: `bdas_session` · HttpOnly · `SameSite=Lax` · 7-day fixed expiry
- Host-only (no `Domain` attribute) — an internal app session, not shared with any other surface
- Algorithm: HS256 with `SSO_JWT_SECRET` (≥ 32 chars, internal app secret)
- Claims: `iss=bdas, sub=usr_..., email, roles[], ver=1, iat, exp, jti=ses_...`

## Testing

`src/index.test.ts` is an integration test against a real Postgres schema
(per CLAUDE.md §4: no DB mocks). It runs the full `register → verify → login
→ logout → request-reset → complete-reset` path. Requires `DATABASE_URL` to
point at a writable Postgres (Docker locally; the GHA workflow's service
container in CI).

## Rate limits (Sprint 1 defaults)

| Action                 | Key                             | Limit | Window |
| ---------------------- | ------------------------------- | ----- | ------ |
| `register`             | `register:ip:<ip>`              | 5     | 1 hour |
| `login` (per IP)       | `login:ip:<ip>`                 | 10    | 15 min |
| `login` (per email)    | `login:email:<email>`           | 5     | 15 min |
| `requestPasswordReset` | `reset-request:ip:<ip>`         | 5     | 1 hour |
| `changePassword`       | `password-change:user:<userId>` | 5     | 1 hour |

Replace with Redis-backed sliding window if scale demands it.

## Federal-board bootstrap (per build plan §2)

If a logged-in user's email is in `BDAS_FEDERAL_BOARD_EMAILS`, the
`federal_board` role is included in the JWT at issue time. No DB row, no
hidden state — change the env var, re-login, role updates. The `members`
module (Sprint 3) will own role grants properly; this is the bootstrap.
