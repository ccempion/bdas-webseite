/**
 * Legal page routes (ADR 0008, as amended by ADR 0009). The
 * Datenschutzerklärung and Impressum are hosted in-app as routes — the
 * standalone dashboard owns its own legal content.
 */
export function legalUrls(): { readonly privacy: string; readonly imprint: string } {
  return {
    privacy: "/datenschutz",
    imprint: "/impressum",
  };
}
