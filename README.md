# BDAS Platform

Modular monorepo for the BDAS digital platform. The eight modular rules in [`CLAUDE.md`](./CLAUDE.md) §1 are non-negotiable — read them before writing code. The product spec at [`docs/bdas-platform-spec.md`](./docs/bdas-platform-spec.md) is the source of truth for _what_ to build; [`docs/build-plan.md`](./docs/build-plan.md) is the agreed sequencing.

## Layout

```
apps/        Next.js apps: web (public site) and dashboard (internal cockpit)
modules/     Business modules — auth, members, groups, events, files, ...
core/        Shared, non-domain primitives:
             db, errors, types, id, feature-flags, events,
             storage, design-system
infra/       Migration aggregator and other deployment glue
docs/        Spec, build plan, ADRs (docs/decisions/)
```

## Quick start

```bash
pnpm install
cp .env.example .env.local      # then fill in secrets
pnpm db:up                       # local Postgres in Docker
pnpm db:migrate                  # apply module migrations in manifest order
pnpm test
```

## Common scripts

| Command                                        | What it does                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                                     | Run all workspace `dev` scripts in parallel                          |
| `pnpm typecheck`                               | TS check across every workspace                                      |
| `pnpm lint` / `pnpm lint:fix`                  | ESLint, including module-boundary rules                              |
| `pnpm format` / `pnpm format:check`            | Prettier                                                             |
| `pnpm test` / `pnpm test:watch`                | Vitest                                                               |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:logs` | Local Postgres lifecycle                                             |
| `pnpm db:migrate`                              | Apply pending migrations in `infra/migrations/src/manifest.ts` order |
| `pnpm db:migrate:dry`                          | Print the plan without touching the DB (CI gate)                     |

## Module rules in 30 seconds

- A module owns its tables. Other modules go through its public service interface (`modules/<name>/src/index.ts`).
- Migrations live with the module (`modules/<name>/migrations/`). The aggregator runs them in the order declared in `infra/migrations/src/manifest.ts` — never by directory walk.
- Every module sits behind a feature flag in `core/feature-flags`. Flags default OFF.
- Cross-module side effects use `core/events`, not direct service calls.

ESLint and `package.json` `exports` together block deep cross-module imports; violations fail CI.
