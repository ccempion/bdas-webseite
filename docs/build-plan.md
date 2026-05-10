# BDAS Platform — Build Plan and Working Notes

This document is the agreed sequencing and approach for building the platform described in [`bdas-platform-spec.md`](bdas-platform-spec.md). It also records how to collaborate with Claude Code effectively on this build.

---

## 1. Current state of the repository

A pnpm-workspace monorepo skeleton with the correct folder structure, plus the full product specification and a WordPress context note. **Nothing is implemented yet** — every directory under `apps/`, `modules/`, and `core/` contains only a `.gitkeep`. The spec at `docs/bdas-platform-spec.md` is detailed (~585 lines, 25 sections) and is the source of truth for what to build.

---

## 2. Decisions to lock in before writing code

These are cheap to choose now, expensive to change later. The spec leaves them open.

| Decision                                      | Options                                                | Recommendation                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **DB host**                                   | Supabase / Neon                                        | **Supabase** — also provides object storage (Phase 2) and a unified dashboard. One vendor for DB + storage = less glue.                      |
| **Auth library**                              | Lucia / Auth.js                                        | **Lucia** — Auth.js's defaults fight the WordPress-SSO requirement (custom cookie domain, JWT shape). Lucia is a thin primitive you control. |
| **Local dev DB**                              | Docker Postgres / shared dev DB                        | **Docker Postgres** per developer — keeps migration dry-run honest.                                                                          |
| **Federal-board bootstrap** (open Q from §25) | Manual SQL / first-registered-user / env-var allowlist | **Env-var allowlist of email addresses** that auto-receive `federal_board` on first login. Documented, reversible, no production-data hacks. |
| **Domain**                                    | `bdas.de` + `dashboard.bdas.de` / single sub-domain    | **Two sub-domains** — spec already prefers this; cookie scope works either way.                                                              |

Once these are locked, capture each one as an ADR in `docs/decisions/`.

---

## 3. Phase 1 — sprint plan

Phase 1 acceptance (§23 of the spec) is the goal: register → verify → login → SSO into WordPress → browse groups → local board approves a member. Roughly 3–4 weeks of focused work.

### Sprint 0 — Bootstrap (1–2 days)

Make the modular rules enforceable from day one. Skip this and rule violations slip in invisibly.

- `pnpm init` each workspace, base `tsconfig`, ESLint config that **forbids cross-module deep imports** (e.g. `@bdas/members/src/...` → only `@bdas/members` allowed). Mechanically enforces §5 rule 8.
- `core/db` Drizzle client + a migration runner in `infra/migrations` that discovers `modules/*/migrations/` and runs them in the order declared in a manifest (rule 7).
- `core/feature-flags` reading from env (rule 6). Every new route checks `if (!flags.events) return 404`.
- A typed event bus in `core/events` so modules can publish without coupling (rule 2).
- GitHub Actions: typecheck + lint + test + `drizzle-kit migrate --dry-run` on every PR.
- `.env.example` at repo root and per-module.

### Sprint 1 — Auth + UI shell (3–5 days)

- `core/design-system`: tokens, `Button`, `Input`, `Form`, `Card`, `Alert`. Tailwind config exported. Keep the surface small — every primitive added is one more thing the WordPress theme will eventually need to mirror.
- `auth` module: schema migration, register, verify email (Resend), login, logout, password reset, rate limiter middleware. Public interface = `getCurrentUser`, `requireRole`, event emissions.
- `apps/web`: root layout, `/anmelden`, `/registrieren`, `/passwort-zuruecksetzen`, `/account` (skeleton).

**Stop here and ship.** Auth alone is testable end-to-end and unblocks everything else.

### Sprint 2 — Groups (2–3 days)

Build before members because `members.primary_group_id` references it.

- Schema + migrations (without `join_fee_*` columns — those land in Phase 6).
- Service layer: `getGroup`, `listGroups`, `getJoinPolicy` (returns `{ required: false }` stub).
- Public pages: `/gruppen` (list) and `/gruppen/[slug]` (profile).
- A seed script for the ~20 known Hochschulgruppen so the public site has content.

### Sprint 3 — Members (3–5 days)

- Schema + migrations (without `group_change_requests` — Phase 6).
- Service layer: profile CRUD, `transitionStatus`, `grantRole`/`revokeRole` with privilege guards.
- `/account` profile editor.
- A **temporary** `/admin/pending-members` page gated by `federal_board` so a board user can approve pending members. The real UI lives in `apps/dashboard` in Phase 3 — this is a one-screen stopgap, _not_ the dashboard app.
- Wire the env-var federal-board bootstrap rule.

### Sprint 4 — Content bridge + WordPress SSO (2–3 days)

- `content-bridge` read side: typed WordPress REST client with `revalidate: 3600` caching. Used on homepage and group profile intro.
- Auth: issue the cross-domain cookie (`Domain=.bdas.de`, signed JWT).
- `wp-plugin/bdas-sso`: minimal PHP plugin reads the cookie, hydrates `wp_set_current_user`. Role mapping is Phase 5 — Phase 1 only does "logged in vs not".

### Sprint 5 — Phase 1 acceptance pass (2–3 days)

- German strings audit, cookie banner, GDPR consent on register, data-export endpoint stub.
- Lighthouse mobile ≥ 90.
- Walk through each §23 criterion with a real account; check the box only when it actually works.

---

## 4. Post-Phase-1 sequencing

Phase 2 (events + notifications + files) is the **highest user-value-per-week phase** — events are the federation's loudest pain point. Don't be tempted to jump to the dashboard (Phase 3) first; without events to manage, the dashboard has nothing to show. Build the data, then the cockpit.

Phase 6 (payments) is last on purpose — the spec defers it because the federation can survive without it. Don't let "but we want donations live!" pull money work earlier; the join-fee logic depends on member status flows that mature in Phases 1–3.

---

## 5. Risks that bite if ignored

- **Rule-1 violations are silent.** A module reading another's tables typechecks fine. Add a CI lint that greps for `from "modules/*/schema"` outside the module itself, and fail the build.
- **Migration ordering across modules** is the gnarliest monorepo problem. The aggregator in `infra/migrations` needs a deterministic order — declare it explicitly in a manifest, not by directory walk.
- **The SSO cookie is the load-bearing wall.** Get the JWT shape, signing key, and cookie domain right in Sprint 1. Changing it later means re-issuing all sessions and shipping a WordPress plugin update.
- **§25 open questions** — at minimum, get answers to the federal-board bootstrap question (Sprint 3 needs it) and the dues / Spendenbescheinigung question (before Phase 6) from the federation.

---

## 6. Working with Claude — what to expect

### Where Claude is strong on this project

- **The exact stack.** TypeScript, Next.js 14 App Router, Drizzle, Tailwind/shadcn, Lucia, Stripe, Resend.
- **Enforcing the §5 modular rules mechanically.** ESLint boundary rules, dependency-cruiser checks, per-module migration manifest — all wired so violations fail CI instead of needing human catch.
- **End-to-end module delivery.** Schema → migration → service → route handler → UI page → tests, in one focused session per module. Dev server, tests, fix TypeScript errors, commit incrementally.
- **Reading the spec precisely.** Translating module-by-module without inventing scope.
- **Refactoring and self-review.** Plus dedicated `/review` skill for PR review and `/security-review` for auth/payments work.
- **Long, multi-step tasks.** Running 30-step builds and reporting against acceptance criteria.

### Where Claude needs you

- **Federation product decisions.** The §25 open questions are not Claude's to answer. Rulings from the Bundesvorstand on dues structure, Spendenbescheinigung, alumni rights, dormant-group policy.
- **Visual verification.** Claude can't see the rendered UI. Code is written, dev server starts, but pixel-precise design needs your eyes (or screenshots back to Claude). Provide Figma references where they exist.
- **Real accessibility testing.** Claude produces WCAG-clean markup and Lighthouse ≥ 90, but actual screen-reader and keyboard QA needs a human pass. Same for German copy nuance — a native speaker should review board-facing strings.
- **Credentials and external services.** Supabase project, Stripe account, Resend domain — you bootstrap them, paste the keys into `.env`, Claude wires the rest.
- **Knowledge cutoff** is August 2025. If a library has a breaking change after that, either `pnpm install` errors will reveal it or you flag it.
- **Cross-session memory is structured, not infinite.** This is why `CLAUDE.md` and per-module READMEs matter — they're how knowledge persists.

### Collaboration pattern that produces "perfect"

The single biggest lever. Most quality loss with an AI builder comes from drift: scope creep, modular-rule violations, regressions in modules Claude isn't currently looking at. Defenses, in priority order:

1. **`CLAUDE.md` at repo root** — loaded every session. Encodes the §5 rules, the tech stack, "reject any change that imports across module internals," the federal-board bootstrap rule, pointers to the spec. (This file now exists.)

2. **One module per session.** Paste §1–6, the target module section, and the public interfaces of its dependencies. Claude delivers a complete, mergeable module. Three modules at once produces mush.

3. **Plan mode for non-trivial work.** Before code on anything beyond a one-file change, draft a plan, you approve, then execute.

4. **Tests as a hard gate, not a follow-up.** Every module ships with its own tests in the same PR. Phase 1's auth and member-approval flows must have integration tests against real Postgres, not mocks.

5. **Use the review skills before merging.**
   - `/review` for ordinary PRs
   - `/security-review` mandatory before merging auth, payments, or files modules
   - `/ultrareview` (you trigger it) for end-of-phase gates — multi-agent review of an entire phase's branch

6. **Push back on scope creep.** Call out "while I'm here…" additions and Claude will cut them.

7. **Per-module READMEs as living documentation.** Each module's README captures its public interface, owned tables, and any non-obvious decisions. The spec module sections are the starting template.

8. **Decisions in writing, in the repo.** Open questions get answered in `docs/decisions/NNNN-description.md` (ADR format). The folder is already there. Nothing important should live only in chat — chat history is not durable.

### Tools available

- **Plan mode** — draft an approach for review before execution
- **Worktree isolation** — spin a side worktree to try something risky without touching your branch
- **Subagents** — parallel work (e.g. one agent researching the WordPress REST API while Claude implements the bridge)
- **Background tasks** — long-running test suite or `tsc --watch` in the background, check back periodically
- **Memory system** — preferences and project facts persist across sessions in structured form
- **`/review`, `/security-review`, `/ultrareview`** — review skills as described
- **MCP for browser/Playwright** — _not currently configured_. If you want Claude to actually click through the UI, set up a Playwright MCP server. Otherwise visual verification stays manual.

---

## 7. Recommended starting moves

In order:

1. **Answer the five decisions in §2 above.** ~30 minutes. Capture each as an ADR.
2. **Get answers from the federation on the §25 questions that gate Phase 1, 3, and 6** — at minimum the federal-board bootstrap question.
3. **Sprint 0: bootstrap `core/` and tooling.** This gives the rails for everything else and can start before §2 is fully resolved.

After that, module-by-module: one PR per module, tests in the PR, review skill on the PR, merge behind a feature flag.
