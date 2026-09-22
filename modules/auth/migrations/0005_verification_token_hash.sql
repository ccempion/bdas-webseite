-- Der Bestätigungslink meldet seit ADR 0051 an, ist also ein Anmeldemittel.
-- Damit darf er nicht mehr im Klartext in der Datenbank liegen: die Tabelle
-- speichert nur noch den SHA-256-Hex des Tokens, wie es das Reaktivierungs-
-- Token aus 0004 schon tut.
--
-- `sha256()` und `convert_to()` sind Kernfunktionen (Postgres >= 11), also
-- braucht die Umstellung keine Erweiterung: bereits verschickte Links bleiben
-- gültig, weil der Hash aus dem vorhandenen Token berechnet wird.

ALTER TABLE auth_email_verifications
  ADD COLUMN token_hash text;

UPDATE auth_email_verifications
   SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex');

ALTER TABLE auth_email_verifications
  DROP CONSTRAINT auth_email_verifications_pkey;

ALTER TABLE auth_email_verifications
  DROP COLUMN token;

ALTER TABLE auth_email_verifications
  ALTER COLUMN token_hash SET NOT NULL;

ALTER TABLE auth_email_verifications
  ADD CONSTRAINT auth_email_verifications_pkey PRIMARY KEY (token_hash);
