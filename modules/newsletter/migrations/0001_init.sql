-- Newsletter module — consent collection for a newsletter that is not yet
-- sent (docs/superpowers/specs/2026-09-06-newsletter-modul-design.md).
-- user_id is a plain auth-user id, no cross-module FK (blog/faq precedent).

CREATE TABLE newsletter_subscribers (
  id                      text PRIMARY KEY,
  -- Normalized (trim + lowercase). The duplicate key; for rows with a
  -- user_id the *current* account address wins at read time (spec §4),
  -- so this value is allowed to go stale.
  email                   text NOT NULL UNIQUE,
  user_id                 text,
  status                  text NOT NULL
    CHECK (status IN ('pending','subscribed','unsubscribed','declined')),
  confirm_token_hash      text,
  confirm_expires_at      timestamptz,
  unsubscribe_token_hash  text NOT NULL,
  source                  text NOT NULL CHECK (source IN (
    'footer','registrierung','registrierung_erfolg','konto','dashboard_hinweis',
    'blog','event_gast','puck_block','scroll_panel','landingpage'
  )),
  source_path             text,
  group_id                text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  confirmed_at            timestamptz,
  unsubscribed_at         timestamptz
);

-- One subscription per account. Partial, because most rows are anonymous.
CREATE UNIQUE INDEX newsletter_subscribers_user_id_key
  ON newsletter_subscribers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX newsletter_subscribers_unsub_token_key
  ON newsletter_subscribers (unsubscribe_token_hash);
CREATE INDEX newsletter_subscribers_confirm_token_idx
  ON newsletter_subscribers (confirm_token_hash);
CREATE INDEX newsletter_subscribers_status_idx
  ON newsletter_subscribers (status, created_at);

-- Append-only proof under Art. 7 (1) GDPR. No service ever updates or
-- deletes a row here; account deletion cascades (spec §10).
CREATE TABLE newsletter_consent_log (
  id             text PRIMARY KEY,
  subscriber_id  text NOT NULL
    REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  event          text NOT NULL CHECK (event IN (
    'subscribed','confirmed','resubscribed','unsubscribed','declined'
  )),
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  -- Plaintext on purpose: a hashed IP proves nothing, and proof is the
  -- column's only purpose (spec §10).
  ip             text,
  user_agent     text,
  source         text,
  source_path    text
);
CREATE INDEX newsletter_consent_log_subscriber_idx
  ON newsletter_consent_log (subscriber_id, occurred_at);

-- Deliberate copy of the fixed-window limiter in modules/auth (spec §4):
-- the original is bound to auth_rate_limits and not exported.
CREATE TABLE newsletter_rate_limits (
  key           text PRIMARY KEY,
  count         integer NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- Server-side memory for "not now" (spec §6.1): follows the person across
-- devices, and §25 TDDDG never applies.
CREATE TABLE newsletter_prompts (
  user_id            text PRIMARY KEY,
  last_dismissed_at  timestamptz NOT NULL DEFAULT now(),
  dismiss_count      integer NOT NULL DEFAULT 0
);
