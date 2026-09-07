# ADR 0035 — Newsletter consent: no confirmation mail for logged-in members

**Status:** Accepted
**Date:** 2026-09-08

## Context

The federation wants a newsletter list. German law (§ 7 UWG, Art. 7 (1) GDPR)
requires demonstrable consent from the address holder, and the established way
to demonstrate it is double opt-in: an address is entered, a mail goes out, and
only a click in that mail puts the address on the list.

Applied uniformly, that means a member who is already logged in — whose address
the platform verified at registration — has to leave the site, open a mailbox
and click a second link to subscribe to a newsletter they just asked for. Every
step of that round-trip loses people, and it buys no evidence the platform does
not already hold.

`modules/newsletter` also cannot see an account's address: email is owned by
`modules/auth`, identity by `modules/members`, and rule 1 forbids reaching into
either.

## Decision

**Consent is proven by the strongest evidence available at the point of
capture, not by a fixed ritual.**

1. **Logged in — no confirmation mail.** A click in an authenticated session
   moves the row straight to `subscribed`. The click, its timestamp, its IP,
   its user agent and its source path are written to `newsletter_consent_log`.
2. **Anonymous — full double opt-in.** A `pending` row plus a hashed,
   single-use, seven-day token; only redeeming it subscribes the address.
   Confirmation mail is rate-limited per address (one per 15 minutes, three per
   day), and every public capture point answers identically whatever the state
   of the address, so the form cannot be used to test who is close to the
   federation.
3. **At registration — the verification mail counts for both.** Ticking the
   checkbox writes a `pending` row and sends nothing extra; `auth.user.verified`
   lifts it to `subscribed`. Never verified means never on the list.
4. **`newsletter_consent_log` is append-only.** Nothing in the module updates or
   deletes a row there; entries cascade away only with the subscriber.

## Rationale

Authentication _is_ the second factor that double opt-in exists to establish. A
logged consent inside an authenticated session evidences the address holder's
agreement more strongly than a click in a mail, which anyone the mail was
forwarded to can perform. Requiring the weaker ritual on top of the stronger
proof adds friction without adding evidence.

The registration path is the same argument in one step: the platform is already
sending a verification mail to that exact address, and clicking it proves
control of the mailbox. A second mail proves nothing new.

## Consequences

- `newsletter_consent_log` is the Art. 7 (1) record. It must survive as long as
  the subscription does, and it is the artifact to produce if a consent is ever
  challenged.
- The three capture paths are three services, not one with a flag: their
  evidence models genuinely differ, and collapsing them would make it possible
  to pick the wrong one by passing the wrong argument.
- `/datenschutz` and `docs/datenschutz/` must gain the purpose "Newsletter".
  **This happens in PR 3**, together with the public capture points — before
  those exist, no address is collected outside the platform.
- The module publishes `newsletter.confirmation_requested` and
  `newsletter.already_subscribed` and sends nothing itself, so the delivery
  side can be built, changed or replaced without touching consent handling.

## Alternatives considered

**Double opt-in for logged-in members too.** Discards evidence the platform
already holds and costs signups at every step of the round-trip. Rejected: it
is ceremony, not compliance.

**Single opt-in for everyone.** Not defensible in Germany for an address the
platform cannot show the holder controls. Rejected.

**Storing the account address on the subscriber row and keeping it current via
an `auth.email.changed` handler.** The event now exists, but a second write path
onto the duplicate key is extra surface for duplicates, and read-time resolution
already costs nothing at this size. Rejected for now; reversing it is a separate
decision with its own ADR, not a drive-by change.
