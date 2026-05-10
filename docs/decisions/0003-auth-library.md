# ADR 0003 — Auth Library Choice

- **Status:** Accepted
- **Date:** 2026-05-10
- **Supersedes:** Partial — overrides the Lucia pin in ADR 0001 and CLAUDE.md §2.
- **Superseded by:** —

## Context

CLAUDE.md §2 and ADR 0001 pinned **Lucia** as the auth library. Two facts have shifted since that decision:

1. **Lucia v3 was archived by its maintainer in early 2025**, with a recommendation to copy the source into your own codebase rather than depend on the package. Adding it as a fresh dependency now ships pre-deprecated code.
2. **ADR 0002 locked a JWT-as-cookie design.** Lucia's value proposition is its session-cookie helpers; with our cookie carrying a signed JWT (HS256, claims per ADR 0002), Lucia's cookie code is unused. The only Lucia surface that would still apply — its sessions-table conventions — is roughly 30 lines of Drizzle.

Continuing with Lucia would mean carrying an archived dependency for code we are not running. That violates the spirit of CLAUDE.md §6 ("New abstractions added speculatively for future flexibility").

## Decision

The `auth` module rolls its own minimal session layer on top of Postgres (Drizzle) and uses two well-maintained, narrowly-scoped libraries:

- **`@node-rs/argon2`** — Argon2id password hashing (OWASP-recommended). Prebuilt platform binaries, no compilation in CI.
- **`jose`** — HS256 JWT mint/verify. Tree-shakeable, no Node-only assumptions.

Tables owned by the module (per CLAUDE.md §1 rule 1):

- `auth_users` — identity: id, normalized email, status.
- `auth_credentials` — password hash + algorithm (separate from `auth_users` so password rotation doesn't bump the identity row).
- `auth_sessions` — server-side session rows; `id` doubles as the JWT `jti` for revocation.
- `auth_email_verifications` — single-use 24 h tokens.
- `auth_password_resets` — single-use 1 h tokens.
- `auth_rate_limits` — fixed-window counters, per-key.

The cookie shape (`bdas_session`, HttpOnly, `.bdas.de`, fixed 7 d) is unchanged from ADR 0002.

## Alternatives considered

### Stay on Lucia

Costs: shipping an archived dependency, fighting Lucia's cookie defaults to fit our JWT design, and inheriting Lucia's adapter typings without ongoing maintenance. Benefit: nominal compliance with the original pin.

**Rejected** — the costs are concrete; the benefit is paperwork.

### Auth.js (NextAuth)

Heavy and opinionated; the cross-domain cookie + WordPress-bridge shape from ADR 0002 fights its defaults. ADR 0001 already rejected it for the same reason.

**Rejected** — same reasons as before.

### `oslo` (Lucia author's smaller toolkit)

`oslo` was the recommended successor to Lucia and provides primitives for password hashing, OAuth, JWT, etc. As of mid-2025 it has also slowed in maintenance. Its piece-by-piece scope means we'd be importing two or three of its sub-modules anyway (`oslo/password`, `oslo/jwt`).

**Rejected for v1** — `@node-rs/argon2` + `jose` are equivalent for our needs and have larger maintainer bases. Revisit if `oslo` finds a stable home.

### Roll everything ourselves (`node:crypto.scrypt` + DIY JWT)

Zero deps. But hand-written JWT verification is easy to get wrong (alg confusion, kid handling, base64url quirks), and `jose` is small enough that pulling it in is unambiguously correct.

**Rejected** for the JWT half; **accepted in spirit** for the session-table half (which is genuinely 30 lines of Drizzle).

## Consequences

### Positive

- No archived dependencies in the auth surface.
- The JWT cookie design from ADR 0002 is implemented end-to-end without library workarounds.
- The session-table SQL is small enough to read and audit in one screen — a clearer security posture than Lucia's adapter abstraction.
- Argon2id meets OWASP password-hashing guidance for 2026.

### Negative

- We own more lines of code: ~150 LoC across `password.ts`, `sso.ts`, `sessions.ts` that would otherwise be in a library. Mitigated by integration tests (real Postgres, no mocks per CLAUDE.md §4).
- If a future module wants OAuth providers (Google, GitHub), we add that surface ourselves instead of getting it from Lucia. Defer until the federation actually asks for it.

## Follow-ups

- Update CLAUDE.md §2 to remove the Lucia pin and reference this ADR.
- When `wp-plugin/bdas-sso` lands (Sprint 4), pin its JWT library version against the same `jose` HS256 verifier behaviour and add a fixture-based interop test.
- Re-evaluate at the end of Phase 1: if the rolled-our-own surface is causing review friction, consider extracting it into a small internal package — but only with measured pain, not anticipated.
