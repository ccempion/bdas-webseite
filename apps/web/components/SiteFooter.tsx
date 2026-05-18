/**
 * Site footer landmark. Carries the legal links (Datenschutzerklärung +
 * Impressum) which live in WordPress per spec §27 / ADR 0008 — linked via
 * server-resolved env URLs, never hosted here.
 */
export function SiteFooter({ privacyUrl, imprintUrl }: { privacyUrl: string; imprintUrl: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-bdas-soft bg-bdas-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-bdas-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Bund der Alevitischen Studierenden</p>
        <nav aria-label="Rechtliches" className="flex items-center gap-4">
          <a
            href={privacyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-bdas-red hover:underline"
          >
            Datenschutz
          </a>
          <a
            href={imprintUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-bdas-red hover:underline"
          >
            Impressum
          </a>
        </nav>
      </div>
    </footer>
  );
}
