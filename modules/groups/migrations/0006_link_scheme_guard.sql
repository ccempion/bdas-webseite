-- Security review of #62: `z.string().url()` accepts `javascript:` and `data:`,
-- and React 18 renders such a value as a live `<a href>` on /gruppen/<slug>.
-- The service layer now pins the scheme; this makes the invariant structural so
-- no future writer can reintroduce it, and clears anything already stored.
--
-- The pattern deliberately checks the scheme only (`^https?:`, not
-- `^https?://`): `new URL()` accepts `http:example.com`, so a stricter pattern
-- would reject input the service layer considers valid.
UPDATE groups SET instagram_url = NULL
  WHERE instagram_url IS NOT NULL AND instagram_url !~* '^https?:';
UPDATE groups SET website_url = NULL
  WHERE website_url IS NOT NULL AND website_url !~* '^https?:';

ALTER TABLE groups
  ADD CONSTRAINT groups_instagram_url_scheme_check
    CHECK (instagram_url IS NULL OR instagram_url ~* '^https?:'),
  ADD CONSTRAINT groups_website_url_scheme_check
    CHECK (website_url IS NULL OR website_url ~* '^https?:');
