  [
    {
      "file": "apps/web/lib/notifications-bootstrap.ts",
      "line": 22,
      "summary": "bootNotifications() is only called from the four auth actions, but the events the subscribers listen to 
  (events.event.registered/deregistered, events.waitlist.promoted) are published from apps/web/app/events/[id]/actions.ts and 
  admin/events/actions.ts — which never call it, and no instrumentation.ts exists.",
      "failure_scenario": "On a cold Vercel instance, a member registers for an event as the first server action: registerMember publishes to a bus 
  with zero subscribers → no confirmation email, no notification_log row, no error. Emails only flow when an auth action happened to warm the same 
  instance first. The integration test masks this by registering subscribers manually."
    },
    {
      "file": "modules/notifications/src/notifier-resend.ts",
      "line": 18,
      "summary": "Resend SDK v4 (installed 4.8.0) resolves with {data, error} instead of throwing on API errors; the result is discarded, so failed
  sends bypass sendTransactional's try/catch.",
      "failure_scenario": "Unverified from-domain, bad API key, rate limit, or invalid recipient → every send is rejected by Resend, yet every
  notification_log row reads status='sent', error=null. The audit table — the module's stated purpose — reports false successes and the 'failed'
  path is dead code for the dominant failure class. Fix: `const { error } = await client.emails.send(...); if (error) throw new
  Error(error.message)`."
    },
    {
      "file": "modules/notifications/src/templates.ts",
      "line": 43,
      "summary": "body() interpolates firstName and eventTitle into the HTML email part via raw template literals with no escaping — HTML/link
  injection into official BDAS transactional mail.",
      "failure_scenario": "A member sets firstName to `<img src=x onerror=...>` or a board account creates an event titled `<a
  href=\"https://evil.example\">Klick hier</a>` → markup renders live in recipients' mail clients (phishing surface). Even benign titles like 'Q&A:
  <Workshop>' render broken. One html-escape call in body() fixes the whole class."
    },
    {
      "file": "apps/web/lib/notifications-bootstrap.ts",
      "line": 24,
      "summary": "booted = true is latched before the isFlagOn('notifications') check and before wiring succeeds; subscribers.ts:63 has the same
  one-way latch (subs.length > 0) keyed to whatever bus instance existed at registration time.",
      "failure_scenario": "A process whose first bootNotifications() call saw the flag off can never wire notifications until restart; any
  resetEventBus()/setEventBus() leaves subs pointing at the discarded bus while re-registration silently no-ops, so the fresh bus drops every
  publish. In dev, HMR re-evaluating these modules while the old bus survives produces the inverse: duplicate handler sets → duplicate emails per
  event."
    },
    {
      "file": "apps/web/lib/notifications-bootstrap.ts",
      "line": 30,
      "summary": "Partial Resend config in production (flag on, but RESEND_API_KEY or RESEND_FROM_EMAIL missing) silently falls back to
  consoleNotifier — and notification_log still records status='sent'.",
      "failure_scenario": "RESEND_FROM_EMAIL missing from the Vercel env: every notification is printed to stdout in a serverless function and
  discarded, notification_log fills with 'sent' rows, and nothing warns. Flag-on production should fail loudly on partial config."
    },
    {
      "file": "modules/notifications/src/services/send.ts",
      "line": 41,
      "summary": "Audit invariant gap: only notifier.send() throws produce a 'failed' row — a resolver error yields no row at all, and a
  notification_log insert failure after a successful Resend send yields a delivered email with no audit row.",
      "failure_scenario": "Transient DB error on the insert after the send succeeds: member receives the email, the audit table shows nothing, and
  'sent but unlogged' is indistinguishable from 'never attempted'. Only trace is console.error in ephemeral serverless logs. Write the row first
  (status='pending' or write 'failed' on any error path), or wrap resolver/insert in the same catch."
    },
    {
      "file": "modules/notifications/src/subscribers.ts",
      "line": 49,
      "summary": "Handlers run inline on the synchronous bus inside the user's request: eventTitle() calls getEvent(), which runs two COUNT(*)
  aggregates that are discarded, the resolver does getMember + full getUserExport for just an email — ~6 serial DB round trips plus an awaited
  Resend HTTPS call before the registration action responds.",
      "failure_scenario": "Every event registration/deregistration click gains 200–800ms of Resend latency (multi-second when Resend degrades) plus
  6 serial queries; a cancellation that promotes N waitlisted members re-resolves the same event title N+1 times. Defer send+log out of the response
  path (Next.js after()/waitUntil) and carry the title in the event payload — the publisher already holds the event row."
    },
    {
      "file": "docs/decisions/0007-scoped-role-grants.md",
      "line": 31,
      "summary": "The uncommitted working-tree deletion of docs/result_sprint0–5.md leaves ADR 0007's citation of result_sprint5.md dangling — the
  sole surviving record of the text[] shortcut 'flagged for repayment'.",
      "failure_scenario": "ADRs are rank-1 in the repo's source-of-truth precedence; a future reader following the citation finds nothing, and the
  repayment obligation disappears from the discoverable record. Inline the relevant note into the ADR before deleting, or keep sprint5."
    },
    {
      "file": "modules/notifications/src/templates.ts",
      "line": 17,
      "summary": "All four templates close the German opening low quote „ with an ASCII straight quote (\") instead of \u201c — verified at byte
  level on lines 17, 23, 29, 35.",
      "failure_scenario": "Every outbound email renders „Sommerfest\" instead of „Sommerfest\u201c — visibly broken typography in both text and html
    },
    {
      "file": "modules/notifications/src/templates.ts",
      "line": 17,
      "summary": "All four templates close the German opening low quote „ with an ASCII straight quote (\") instead of \u201c — verified at byte
  level on lines 17, 23, 29, 35.",
      "failure_scenario": "Every outbound email renders „Sommerfest\" instead of „Sommerfest\u201c — visibly broken typography in both text and html
  parts; templates.test.ts only asserts substrings, so CI passes."
    },
    {
      "file": "modules/notifications/src/notifier-resend.ts",
    {
      "file": "modules/notifications/src/templates.ts",
      "line": 17,
      "summary": "All four templates close the German opening low quote „ with an ASCII straight quote (\") instead of \u201c — verified at byte
  level on lines 17, 23, 29, 35.",
      "failure_scenario": "Every outbound email renders „Sommerfest\" instead of „Sommerfest\u201c — visibly broken typography in both text and html
  parts; templates.test.ts only asserts substrings, so CI passes."
    },
    {
      "file": "modules/notifications/src/notifier-resend.ts",
      "line": 17,
      "summary": "All four templates close the German opening low quote „ with an ASCII straight quote (\") instead of \u201c — verified at byte
  level on lines 17, 23, 29, 35.",
      "failure_scenario": "Every outbound email renders „Sommerfest\" instead of „Sommerfest\u201c — visibly broken typography in both text and html
  parts; templates.test.ts only asserts substrings, so CI passes."
    },
    {
      "file": "modules/notifications/src/notifier-resend.ts",
      "line": 14,
      "failure_scenario": "Any Resend behavior change (idempotency keys, retries, the error-handling fix from finding 2, GDPR-mandated footer) must
  be applied in two drivers and two bootstraps and will drift — the unescaped-HTML gap already exists in both copies and must now be fixed twice."
    }
  ]

  module off. Note finding 8 concerns the uncommitted sprint-doc deletions in your working tree, not the merged notifications commits.
  sole surviving record of the text[] shortcut 'flagged for repayment'.",
      "failure_scenario": "ADRs are rank-1 in the repo's source-of-truth precedence; a future reader following the citation finds nothing, and the
  repayment obligation disappears from the discoverable record. Inline the relevant note into the ADR before deleting, or keep sprint5."
    },
    {
      "file": "modules/notifications/src/templates.ts",
      "line": 17,
      "summary": "All four templates close the German opening low quote „ with an ASCII straight quote (\") instead of \u201c — verified at byte
  level on lines 17, 23, 29, 35.",
      "failure_scenario": "Every outbound email renders „Sommerfest\" instead of „Sommerfest\u201c — visibly broken typography in both text and html
  parts; templates.test.ts only asserts substrings, so CI passes."
    },
    {
      "file": "modules/notifications/src/notifier-resend.ts",
      "line": 14,
      "summary": "The Notifier slot, consoleNotifier fallback, Resend driver, and env-based driver selection are structural copies of modules/auth's
  stack instead of a shared core/ email concern (CLAUDE.md rule 4); no ADR or README records a deferred-consolidation decision.",
      "failure_scenario": "Any Resend behavior change (idempotency keys, retries, the error-handling fix from finding 2, GDPR-mandated footer) must
  be applied in two drivers and two bootstraps and will drift — the unescaped-HTML gap already exists in both copies and must now be fixed twice."
    }
  ]

  Findings 1, 2, and 4 compound: even where wiring happens to be warm, failures are recorded as successes and a flag-off cold start latches the
  module off. Note finding 8 concerns the uncommitted sprint-doc deletions in your working tree, not the merged notifications commits.