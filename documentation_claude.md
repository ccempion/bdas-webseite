> **Historical snapshot.** This is an early mirror of `docs/build-plan.md`,
> which is the canonical sequencing doc. The WordPress integration described
> below (content bridge, cross-domain SSO, WP plugin) was removed per ADR 0009;
> the platform is standalone. Prose references are corrected here; the ASCII
> decision tables are left as a frozen record.

1. Sprint-by-sprint plan for Phase 1

Phase 1 acceptance (§23) is the goal: register → verify → login → browse groups → local board approves a  
 member. ~3–4 weeks of focused work.

Sprint 0 — Bootstrap (1–2 days)

What makes the modular rules enforceable from day one. Skip this and rule violations slip in invisibly.

- pnpm init each workspace, base tsconfig, ESLint config that forbids cross-module deep imports (e.g. @bdas/members/src/...
  → only @bdas/members allowed). This enforces §5 rule 8 mechanically.
- core/db Drizzle client + a migration runner in infra/migrations that discovers modules/\*/migrations/ and runs them in  
  declared order (rule 7).
- A tiny core/feature-flags reading from env (rule 6). Every new route checks if (!flags.events) return 404.
- A typed event bus stub in core/events so modules can publish without coupling (rule 2).
- GitHub Actions: typecheck + lint + test + drizzle-kit migrate --dry-run on every PR.
- .env.example at root and per-module.

Sprint 1 — Auth + UI shell (3–5 days)

- core/design-system: tokens, Button, Input, Form, Card, Alert. Tailwind config exported. Keep the surface small — every  
  primitive added is one more thing the WP theme will eventually need to mirror.
- auth module: schema migration, register, verify email (Resend), login, logout, password reset, rate limiter middleware.  
  Public interface = getCurrentUser, requireRole, event emissions.
- apps/web: root layout, /anmelden, /registrieren, /passwort-zuruecksetzen, /account (skeleton).

Stop here and ship. Auth alone is testable end-to-end and unblocks everything else.

Sprint 2 — Groups (2–3 days)

Build before members because members.primary_group_id FKs into it.

- Schema + migrations (without join*fee*\* columns — those land in Phase 6).
- Service layer: getGroup, listGroups, getJoinPolicy (returns { required: false } stub).
- Public pages: /gruppen (list) and /gruppen/[slug] (profile).
- A minimal seed script for the ~20 known Hochschulgruppen so the public site has content.

Sprint 3 — Members (3–5 days)

- Schema + migrations (without group_change_requests — Phase 6).
- Service layer: profile CRUD, transitionStatus, grantRole/revokeRole with privilege guards.
- /account profile editor.
- A temporary /admin/pending-members page gated by federal_board so a board user can approve pending members. (The real UI
  lives in apps/dashboard in Phase 3 — this is a one-screen stopgap, not the dashboard app.)
- Wire the env-var federal-board bootstrap rule.

Sprint 4 — Phase 1 acceptance pass (2–3 days)

- German strings audit, cookie banner, GDPR consent on register, data-export endpoint stub.
- Lighthouse mobile ≥ 90.
- Walk through each §23 criterion with a real account; check the box only when it actually works.

---

2. After Phase 1 — sequencing rationale

Phase 2 (events + notifications + files) is the highest user-value-per-week phase — events are the federation's loudest  
 pain point. Don't be tempted to jump to the dashboard (Phase 3) first; without events to manage, the dashboard has nothing
to show. Build the data, then the cockpit.

Phase 6 (payments) is last on purpose — the spec correctly defers it because the federation can survive without it. Don't  
 let "but we want donations live!" pull money work earlier; the join-fee logic depends on member status flows that mature in
Phases 1–3.

---

3. Things that will bite you if ignored

- Rule 1 violations are silent. A module reading another's tables typechecks fine. Add a CI lint that greps for from  
  "modules/\*/schema" outside the module itself, and fail the build.
- Migration ordering across modules is the gnarliest monorepo problem. The aggregator in infra/migrations needs a  
  deterministic order — declare it explicitly in a manifest, not by directory walk.
- The session cookie is the load-bearing wall. Get the JWT shape and signing key right in Sprint 1. Changing it
  later means re-issuing all sessions.
- §25 open questions — at minimum, get answers to the federal-board bootstrap question (Sprint 3 needs it) and the  
  dues/Spendenbescheinigung question (before Phase 6) from the federation.

---

Want me to start with Sprint 0 (bootstrap + lint rules + migration runner), or would you rather lock in the open decisions
in §0 first?

---

other response about claude codes abilities

Honest read on capabilities, blind spots, and the collaboration pattern that actually produces "perfect" on a multi-week  
 build.

---

What I'm strong at for this project

- The exact stack. TypeScript, Next.js 14 App Router, Drizzle, Tailwind/shadcn, Lucia, Stripe, Resend — I can write
  idiomatic code in all of these without having to look things up mid-flight.
- Enforcing the §5 modular rules mechanically. I'll set up ESLint boundary rules, dependency-cruiser checks, and a
  per-module migration manifest so violations fail CI instead of needing human catch.
- End-to-end module delivery. Schema → migration → service → route handler → UI page → tests, in one focused session per
  module. I run the dev server, run the tests, fix the TypeScript errors, commit incrementally.
- Reading specs precisely. Your spec is unusually well-written; I can translate it module-by-module without inventing
  scope.
- Refactoring and review. I'll catch my own rule-1 violations on re-read, and I have a dedicated /review skill for PR-level
  review and /security-review for auth/payments work.
- Long-running, multi-step tasks. I can run a 30-step build out, hitting each criterion in §23 and reporting back.

---

Where I'll need you (real blind spots)

- Federation product decisions. The §25 open questions are not mine to answer. I need rulings from the Bundesvorstand on
  dues structure, Spendenbescheinigung, alumni rights, dormant-group policy.
- Visual verification. I can't see the rendered UI. I'll write the code, start the dev server, and report what I think it
  looks like — but you (or screenshots back to me) catch the "this looks wrong" cases. For pixel-precise design, give me  
  Figma references or screenshots.
- Real accessibility testing. I can produce WCAG-clean markup and Lighthouse scores ≥90, but actual screen-reader and  
  keyboard-only QA needs a human pass. Same for German copy nuance — I write decent German but a native speaker should review
  board-facing strings.
- Credentials and external services. I can't create the Supabase project, Stripe account, or Resend domain. You bootstrap  
  them, paste the keys into .env, and I wire the rest.
- Knowledge cutoff August 2025. If a library has a breaking change after that, I'll either notice from pnpm install errors
  or you'll need to flag it.
- Cross-session memory is structured, not infinite. I keep persistent notes (preferences, project facts, decisions), but I
  don't carry full conversation transcripts forward. The fix is CLAUDE.md + per-module READMEs — see below.

---

The collaboration pattern that produces "perfect"

This is the single biggest lever. Most quality loss with an AI builder comes from drift: scope creep, modular-rule
violations, regressions in modules I'm not currently looking at. Here's how to prevent it:

1. A CLAUDE.md at the repo root, loaded every session

It should encode:

- The 8 modular rules from §5, verbatim
- The tech stack from §6
- "Reject any change that imports across module internals"
- "Every module has a feature flag; new modules ship behind flag=off in production"
- The federal-board bootstrap rule once decided
- A pointer to docs/bdas-platform-spec.md as the source of truth

I read this on every session start. It's the cheapest way to keep me on rails.

2. One module per session

The spec is built for this — paste §1–6, the target module section, and the public interfaces of its dependencies. I'll  
 deliver a complete, mergeable module. Trying to build three modules at once produces mush.

3. Use plan mode for non-trivial work

Before I write code on anything beyond a one-file change, I draft a plan, you approve, then I execute. This catches "you're
about to do the wrong thing" before any code lands.

4. Tests as a hard gate, not a follow-up

Every module ships with its own tests in the same PR. The spec already says this (§5 rule 5, §23). Don't let me get away  
 with "I'll add tests later." Phase 1's auth and member-approval flows must have integration tests against a real Postgres,
not mocks.

5. Use the review skills before merging

- /review for ordinary PRs
- /security-review mandatory before merging auth, payments, or files modules
- /ultrareview (you trigger it) for end-of-phase gates — multi-agent review of an entire phase's branch

6. Push back when you see scope creep

I'm trained to not add features beyond what's asked, but on a 6-month build it's easy to drift. If I'm adding a "while I'm
here…" feature, call it out and I'll cut it.

7. Per-module READMEs as living documentation

Each module's README captures its public interface, owned tables, and any non-obvious decisions. This is what future-me  
 reads when you ask in three months "why does members not own X?". The spec module sections are your starting template.

8. Decisions in writing, in the repo

Open questions get answered in docs/decisions/NNNN-description.md (ADR format). The folder is already there. Nothing  
 important should live only in chat — chat history is not durable for me.

---

Tools I have that you should know exist

- Plan mode — drafting an approach for review before execution
- Worktree isolation — I can spin a side worktree to try something risky without touching your branch
- Subagents — for parallel work (e.g. one agent researching the WP REST API while I implement the bridge)
- Background tasks — I can run a long-running test suite or tsc --watch in the background and check back
- Memory system — preferences, project facts, decisions persist across sessions in structured form
- /review, /security-review, /ultrareview — review skills as described above
- MCP for browser/Playwright — not currently configured in this environment. If you want me to actually click through the  
  UI, we'd need to set up a Playwright MCP server. Otherwise visual verification stays manual.

---

My honest recommendation for the start

Before any code, do these three things in order:

1. Answer §0 (the 5 decisions in my previous reply) — 30 minutes of your time.

Want me to draft the CLAUDE.md now? I can do that without any of the open decisions being answered — it's pure structural  
 ground rules.

┌──────────────────────┬───────────────────────────────┬──────────────────────────────────────────────────────────────┐  
 │ Decision │ Options │ My recommendation │  
 ├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────┤  
 │ │ │ Supabase — you also get auth-grade row policies, object │  
 │ DB host │ Supabase / Neon │ storage (used in Phase 2), and a unified dashboard. One │  
 │ │ │ vendor for DB + storage = less glue. │  
 ├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────┤  
 │ │ │ Lucia — Auth.js's defaults fight the WordPress-SSO │  
 │ Auth library │ Lucia / Auth.js │ requirement (custom cookie domain, JWT shape). Lucia is a │  
 │ │ │ thin primitive you control, which is exactly what you need │  
 │ │ │ to bridge to WP. │  
 ├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Local dev DB │ Docker Postgres / shared dev │ Docker Postgres per developer — keeps migration dry-run │  
 │ │ DB │ honest. │  
 ├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────┤  
 │ Federal-board │ Manual SQL / │ Env-var allowlist of email addresses that auto-receive │  
 │ bootstrap (open Q │ first-registered-user / │ federal_board on first login. Documented, reversible, no │  
 │ from §25) │ env-var allowlist │ production-data hacks needed. │  
 ├──────────────────────┼───────────────────────────────┼──────────────────────────────────────────────────────────────┤
│ Domain │ bdas.de + dashboard.bdas.de / │ Two sub-domains — spec already prefers this, and the cookie │  
 │ │ single sub-domain │ scope works either way. │
└──────────────────────┴───────────────────────────────┴──────────────────────────────────────────────────────────────┘
