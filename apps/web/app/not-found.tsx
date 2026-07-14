import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-24">
      <p className="text-bdas-ink-muted">Fehler 404</p>
      <h1 className="text-3xl font-semibold text-bdas-ink">Seite nicht gefunden</h1>
      <p className="text-bdas-ink-body">
        Die aufgerufene Seite existiert nicht oder wurde verschoben.
      </p>
      <Link href="/" className="text-bdas-red hover:underline">
        Zur Startseite →
      </Link>
    </main>
  );
}
