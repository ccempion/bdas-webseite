/**
 * Legal page routes (ADR 0008, as amended by ADR 0009 and ADR 0024). The
 * Datenschutzerklärung, the Impressum and the Nutzungsbedingungen are hosted
 * in-app as routes — the standalone dashboard owns its own legal content.
 */
export function legalUrls(): {
  readonly privacy: string;
  readonly imprint: string;
  readonly terms: string;
} {
  return {
    privacy: "/datenschutz",
    imprint: "/impressum",
    terms: "/nutzungsbedingungen",
  };
}
