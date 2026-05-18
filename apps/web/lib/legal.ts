/**
 * Legal page URLs (ADR 0008). The Datenschutzerklärung and Impressum are
 * WordPress pages (spec §27 content layer), not app routes — the app only
 * links to them. Configured per environment; "#" in dev so links are inert
 * but present. Server-only: read these in Server Components/Actions and pass
 * the value down, never expose process.env to the client.
 */
export function legalUrls(): { readonly privacy: string; readonly imprint: string } {
  return {
    privacy: process.env["LEGAL_PRIVACY_URL"] || "#",
    imprint: process.env["LEGAL_IMPRINT_URL"] || "#",
  };
}
