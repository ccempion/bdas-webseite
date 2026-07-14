"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-start gap-4 px-4 py-24">
      <p className="text-bdas-ink-muted">Fehler</p>
      <h1 className="text-3xl font-semibold text-bdas-ink">Etwas ist schiefgelaufen</h1>
      <p className="text-bdas-ink-body">Bitte versuche es erneut.</p>
      <button type="button" onClick={reset} className="text-bdas-red hover:underline">
        Erneut versuchen →
      </button>
    </main>
  );
}
