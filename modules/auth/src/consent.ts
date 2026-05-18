/**
 * Privacy-policy consent version (ADR 0008).
 *
 * Bump this when the Datenschutzerklärung changes materially. `register()`
 * stamps the accepted version onto the user row; historical rows keep the
 * version they actually accepted, so the federation can demonstrate consent
 * (GDPR Art. 7(1)). The string is opaque — date-based is convenient but not
 * required.
 */
export const CONSENT_VERSION = "2026-05-18";
