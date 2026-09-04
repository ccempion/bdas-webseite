# @bdas/faq

Board-editable FAQ entries, topics, contextual help and member submissions
(spec: `docs/superpowers/specs/2026-09-04-faq-suite-v2-design.md`).

## Owned tables

| Table                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `faq_topics`         | Ordered topic groupings for entries              |
| `faq_entries`        | One row per FAQ entry: question, body, status    |
| `faq_entry_links`    | Related-entry cross-references                   |
| `faq_entry_contexts` | Contextual-help attachment points for an entry   |
| `faq_feedback`       | Per-user "war das hilfreich?" votes on an entry  |
| `faq_submissions`    | Member-submitted questions awaiting board triage |

## Services

Everything importable lives in `src/index.ts` (CLAUDE.md §1 rule 8);
`schema.ts`, `pg-errors.ts` and `test-db.ts` are private. Every service takes
the `Db` handle as its first argument (exported as `FaqDb`).

**Topics** (`services/topics.ts`) — ordered groupings an entry may point at.
`listTopics` · `createTopic` · `renameTopic` · `reorderTopics` · `deleteTopic`.
Deleting a topic nulls `topic_id` on its entries (FK `ON DELETE SET NULL`); the
entries survive.

**Entries** (`services/entries.ts`) — the FAQ itself: question, Tiptap body,
optional YouTube id, related entries and contextual-help contexts.
`listEntries` · `listEntriesByContext` · `createEntry` · `updateEntry` ·
`publishEntry` · `unpublishEntry` · `reorderEntries` · `deleteEntry`.
Entries are created as `draft` and only become member-visible on publish.
`position` is allocated per `(section, subgroup)` scope, and re-allocated when
an entry moves between scopes. `updateEntry` replaces `relatedIds` and
`contexts` wholesale.

**Submissions** (`services/submissions.ts`) — member-submitted questions.
`createSubmission` · `listSubmissions` · `openSubmissionCount` ·
`discardSubmission`. `createSubmission` is the one write any logged-in member
can reach, so its inputs are trimmed and capped (question 300, details 2000,
context 200). Passing a submission's id to `createEntry` links the two; the
submission flips to `answered` when that entry is published. `discardSubmission`
only acts on an `open` submission. No email is sent on submission (spec §4).

**Feedback** (`services/feedback.ts`) — "war das hilfreich?".
`upsertFeedback` · `feedbackCounts`. One changeable vote per member per entry
(composite primary key). Only aggregates leave the module — who voted never
does.

### Conventions

Services are **auth-agnostic**: they validate, they do not authorize. The app
layer checks grants and is responsible for the `userId`/`updatedBy` it passes
being the caller's own.

Errors are `@bdas/errors` with German messages: `ValidationError` for bad
input, `NotFoundError` for an unknown id — including a foreign-key violation
from a stale `relatedIds` entry or an unknown `topicId`, which never escapes as
a raw Postgres error. The reorder services are the deliberate exception: they
skip ids they cannot find rather than throwing, so a reorder racing a delete
does not blow up.

Ordering from `listEntries` is _storage_ order — sections and subgroups sort by
their declaration order in `types.ts`. The order actually shown to a member is
the app layer's call (PR 2 reorders per viewer role).

## Feature flag

Gated by `faq_suite` in `core/feature-flags` (CLAUDE.md §3). Off in production
until the suite is acceptance-complete; the route layer is what checks it.

## Migrations

Declared in `infra/migrations/manifest.ts` under `"faq"`, applied in filename
order:

| File            | Contents                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_init.sql` | The six tables, their indexes, and RLS enabled with no policy (service-role / direct-Postgres path only)                               |
| `0002_seed.sql` | The 30 published entries and 5 topics migrated out of `apps/web/content/faq/`; regenerate with `apps/web/scripts/generate-faq-seed.ts` |

`0002_seed.sql` is idempotent (`ON CONFLICT (id) DO NOTHING`) and its rows keep
their readable slug ids — those ids are the `/faq#<id>` deep-link anchors.
Board-created entries get `createId("faq")` ids instead.

## Tests

`pnpm --filter @bdas/faq test` — integration tests against a real Postgres in
Docker (`postgres://bdas:bdas@localhost:5432/bdas`, override with
`DATABASE_URL`), never mocks (CLAUDE.md §4). Each test gets a fresh schema from
`setupFaqDb()`. That applies schema migrations only; `setupFaqDb({ seed: true })`
opts into the content seed, which `src/seed.test.ts` uses. Without a reachable
Postgres the suites skip rather than fail.
