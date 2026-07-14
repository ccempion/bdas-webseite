# 0020 — Support multiple sender addresses per email type

- Status: Proposed
- Date: 2026-07-07
- Supersedes: —

## Context

Currently, all outbound emails are sent from a single hardcoded sender address (`RESEND_FROM_EMAIL`, e.g., `team@bdas.de`). This works for a generic platform but limits the user experience and sender credibility:

- Event notifications concerning a single group should appear to come from that group's own address (e.g., `berlin@bdas.de`)
- Informational/IT emails should come from `it@bdas.de` or `noreply@bdas.de`
- Marketing emails should come from `marketing@bdas.de`
- System notifications might come from `notifications@bdas.de`

A recipient replying to an event notification from `team@bdas.de` doesn't know which group to reach out to.

**Group-scoped senders must be replyable.** Each local group already owns a real, monitored inbox at `{group-slug}@bdas.de` (e.g., `berlin@bdas.de`). Any event notification that concerns only one group is sent from that address, so a recipient can simply reply and reach the group. We deliberately do **not** synthesize a prefixed address like `events-berlin@bdas.de`: no such mailbox exists, replies to it would bounce or go unread, and an unrepliable "from" on a transactional email is exactly the friction we are trying to remove.

## Decision

1. **Extend the `OutboundEmail` type** to include an optional `from` field:

   ```typescript
   export type OutboundEmail = {
     from?: string; // new: sender address (falls back to RESEND_FROM_EMAIL)
     to: string;
     subject: string;
     html: string;
     text: string;
   };
   ```

2. **Update the Resend notifier driver** to respect per-email sender:

   ```typescript
   await client.emails.send({
     from: email.from ?? opts.from, // per-email override, fallback to default
     to: email.to,
     subject: email.subject,
     html: email.html,
     text: email.text,
   });
   ```

3. **Group-scoped senders reuse the group's own slug address.** A notification about a single group is sent from `{group-slug}@bdas.de` — the group's existing, replyable inbox — never a prefixed variant. Examples:
   - `team@bdas.de` (default)
   - `berlin@bdas.de` (event notifications for the Berlin group)
   - `london@bdas.de` (event notifications for the London group)
   - `marketing@bdas.de`
   - `noreply@bdas.de`
   - `it@bdas.de`

4. **Verify all sender addresses in Resend** before deployment. Since `bdas.de` is already verified, any `*@bdas.de` address works with a single `RESEND_API_KEY`. The group-slug addresses are already real mailboxes, so no new inboxes are created — only Resend sending needs to be confirmed for the domain.

5. **No breaking change**: modules that don't specify `from` in `OutboundEmail` fall back to `RESEND_FROM_EMAIL`, preserving current behavior.

## Consequences

- Each module emitting emails can now supply its desired sender address
- **Event module**: emits notifications for single-group events from that group's own address (`{group-slug}@bdas.de`), so recipients can reply straight to the group
- **Notifications module**: can use `noreply@bdas.de` for system alerts that are not meant to be replied to
- **Auth module**: can continue using `team@bdas.de` for password resets, or switch to `noreply@bdas.de`
- Recipients have clear, replyable routing: a group-scoped email lands back in the group's own inbox on reply
- Requires care to only ever use group-slug addresses that correspond to real, verified mailboxes (a typo yields an unrepliable or non-whitelisted sender)

## Implementation notes

- This is a _future_ capability; no code changes are scoped yet
- When implementing, update all sites where `OutboundEmail` is constructed to consider passing `from` if contextually relevant (especially event registration, notifications from groups)
- Verify all intended sender addresses in Resend dashboard **before** code uses them; a typo results in a Resend API error at send time
- Consider a helper in `modules/notifications` or `core/notifications` to construct group-scoped senders (e.g., `fromGroupEmail(groupSlug)` → `{slug}@bdas.de`), keeping the mapping in one place so the replyable-address invariant can't drift
