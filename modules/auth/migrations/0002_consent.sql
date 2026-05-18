-- Auth — GDPR consent at registration (ADR 0008).
--
-- Records that a user accepted the Datenschutzerklärung and which version,
-- so the federation can demonstrate consent (GDPR Art. 7(1)). Nullable:
-- pre-existing rows pre-date consent (pre-production, none deployed); every
-- new registration sets both columns together via register().

ALTER TABLE auth_users
  ADD COLUMN consent_at timestamptz,
  ADD COLUMN consent_version text;
