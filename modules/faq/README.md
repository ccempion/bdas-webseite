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

Services are auth-agnostic; the app layer authorizes.
