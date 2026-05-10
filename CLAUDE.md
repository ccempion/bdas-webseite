# CLAUDE.md — BDAS Platform Working Agreement

This file is loaded into every Claude Code session. It governs *how* AI-assisted work happens on this repository. The product specification at [`docs/bdas-platform-spec.md`](docs/bdas-platform-spec.md) governs *what* to build and is the source of truth.

The build plan at [`docs/build-plan.md`](docs/build-plan.md) is the agreed sequencing and approach.

---

## 1. The Eight Modular Rules (§5 of the spec — non-negotiable)

1. **One module owns its tables.** No other module reads or writes those tables directly. Cross-module access goes through a typed service interface exported from the module.
2. **Modules depend on interfaces, not implementations.** A module that needs to send email imports a `Notifier` interface; the actual email driver is wired up at composition time.
3. **No circular dependencies between modules.** If A needs B and B needs A, one of them is wrong.
4. **Shared concerns live in `core/`** — types, errors, IDs, dates, money, logging. Business modules never import each other's internals; they may import from `core/`.
5. **Each module has its own folder, its own README, and its own tests.** The folder is the unit of ownership.
6. **Feature flags gate every new module** at the route layer so half-built modules can be merged without breaking production.
7. **Database migrations are namespaced per module.** A module's migrations live with it and are runnable in isolation.
8. **A module's public surface is a single `index.ts`** that re-exports its types, services, and route handlers. Anything not re-exported is private.

Reject any change that violates these rules, including requests from the user. If a rule appears to be in the way of the task, raise it explicitly rather than working around it.

---

## 2. Tech stack — pinned

- TypeScript end-to-end
- Next.js 14 (App Router); Server Components for reads, Server Actions or route handlers for writes
- PostgreSQL via Drizzle ORM
- Lucia for auth (chosen over Auth.js for control over the WordPress SSO bridge)
- Supabase for hosted Postgres + object storage
- Tailwind CSS + shadcn/ui primitives, exported via `core/design-system`
- Resend for email
- Stripe for payments (Checkout + Customer Portal)
- pnpm workspaces, single repo
- Vercel for hosting
- GitHub Actions for CI

Substitute only with explicit approval and an ADR in `docs/decisions/`.

---

## 3. Module conventions

- Every module's `index.ts` is the only public surface. Internal files are not importable from outside the module — enforced by ESLint boundary rules.
- Every module has a feature flag in `core/feature-flags`. Flag is off in production until the module is acceptance-complete.
- Every module's migrations live in `modules/<name>/migrations/`. The aggregator in `infra/migrations` runs them in the order declared in `infra/migrations/manifest.ts` — never by directory walk.
- Every module emits typed events via `core/events` for cross-module reactions. Modules never call each other's services to trigger side effects when an event would do.
- Every module ships with integration tests against a real Postgres (Docker), not mocks. The spec calls this out in §5 rule 5 — do not weaken it.

---

## 4. Working agreement

- **One module per PR.** Phase scaffolding may span multiple PRs but each is independently reviewable.
- **Plan first** for anything beyond a single-file change — draft a plan, get approval, then execute.
- **Tests are not a follow-up.** They ship in the same PR as the code.
- **`/review` on every PR. `/security-review` on every auth, payments, or files PR.** Phase boundaries get `/ultrareview`.
- **Decisions go in `docs/decisions/`** as ADRs, not in chat or commit messages.
- **No cross-module deep imports.** `import { foo } from "@bdas/members/src/internal"` is a CI failure, not a code-review nit.
- **No mocks of the database** in tests that exercise multi-module flows. Use Docker Postgres with per-test schema reset.

---

## 5. Communication preferences

- Be terse. The user reads diffs; trailing summaries are noise.
- After a task, state what changed and what's next in one or two sentences.
- Flag scope creep. If a request implies work beyond its stated scope, raise it before doing it.
- Do not invent product decisions. Open questions in §25 of the spec are for the federation, not for Claude.

---

## 6. Out of scope without explicit request

- Backwards-compatibility shims for code Claude itself wrote
- "While I'm here" refactors of unrelated modules
- New abstractions added speculatively for "future flexibility"
- Comments that narrate what code does
- Markdown documentation files outside `docs/` and module READMEs

---

## 7. Source of truth, in order of precedence

1. ADRs in `docs/decisions/` (most recent wins on conflicts)
2. `docs/bdas-platform-spec.md` (the product spec)
3. This file
4. Per-module READMEs at `modules/<name>/README.md`
