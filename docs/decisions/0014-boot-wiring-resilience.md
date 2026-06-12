# ADR 0014 — Boot wiring: fail loud on misconfig, degrade on transient infra errors

- **Status:** Accepted
- **Date:** 2026-06-12
- **Supersedes:** —
- **Superseded by:** —

## Context

`apps/web/instrumentation.ts` boots flag-on modules before any request is
served, and that boot path was uniformly fail-loud: any throw crashes the
instance and every dynamic route 500s.

That posture caused two production outages:

1. A malformed `SUPABASE_URL` value crashed every route at boot (2026-06-11,
   resolved same day).
2. The Phase 3 dashboard go-live redeploy hit a transient `CONNECT_TIMEOUT` in
   `bootFiles()` → `await ensureFolders(getDb())` on cold start. Boot threw,
   every dynamic route 500'd, and prod had to be rolled back. The dashboard
   flag was not at fault — fresh cold starts exposed a latent fragility in the
   files boot (its flag was already on in prod).

Fail-loud is the right call for deterministic misconfiguration: it surfaces a
broken deploy immediately and reproducibly, before traffic depends on it. It is
the wrong call for transient infrastructure errors: a single slow DB connect
must not convert into a full outage, especially for boot work that is
idempotent and self-healing.

## Decision

Boot-time wiring distinguishes two failure classes:

- **Deterministic misconfig** (missing/partial env vars, malformed config):
  still fail loud. These checks are synchronous, reproducible, and a crashed
  deploy is the desired signal.
- **Transient infra errors** (DB connect timeouts, network failures) in boot
  work that is idempotent and recoverable: never crash the instance. Bound the
  time the attempt may delay boot, log loudly, retry with backoff in the
  background, and rely on the operation's self-healing (next boot, or the
  `group.created` subscriber for folder provisioning).

Concretely, `bootFiles()` caps the boot-blocking `ensureFolders` attempt at 5s
and retries in the background (10s/30s/60s backoff) instead of throwing.

## Consequences

- A redeploy can no longer be taken down by a slow or briefly unreachable
  database at cold start.
- If provisioning genuinely fails, the files page may briefly miss folders for
  a new group until a retry, the next boot, or the next `group.created` event
  provisions them; all other routes are unaffected.
- Any future boot step that performs I/O must follow the same split: validate
  config fail-loud, execute I/O fail-soft with retry. Verification of a deploy
  must check a **dynamic** route on the deployment's own URL — `/` is static
  and 200s from the CDN even when boot is broken.
