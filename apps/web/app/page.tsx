import Link from "next/link";

import { listPosts } from "@bdas/content-bridge";
import { Card } from "@bdas/design-system";
import { isFlagOn } from "@bdas/feature-flags";

const DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export default async function HomePage() {
  const groupsOn = isFlagOn("groups");
  const bridgeOn = isFlagOn("content_bridge");
  const posts = bridgeOn ? await listPosts({ limit: 3 }) : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-bdas-ink">BDAS</h1>
        <p className="text-bdas-ink-body">
          Bund Deutscher Alevitischer Studierender — die Hochschulgruppen-Plattform.
        </p>
      </header>

      {posts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold text-bdas-ink">Aktuelles</h2>
            <a href="https://bdas.de/blog/" className="text-sm text-bdas-red hover:underline">
              Alle Beiträge →
            </a>
          </div>
          <ul className="flex flex-col gap-3">
            {posts.map((p) => (
              <li key={p.id}>
                <a href={p.link} className="block focus:outline-none">
                  <Card className="p-5">
                    <p className="text-sm text-bdas-ink-muted">{DATE_FMT.format(p.publishedAt)}</p>
                    <h3 className="mt-1 text-lg font-semibold text-bdas-ink">{p.title}</h3>
                    {p.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-bdas-ink-body">{p.excerpt}</p>
                    ) : null}
                  </Card>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groupsOn ? (
        <Card hero className="p-6">
          <h2 className="mb-2 text-xl font-semibold text-bdas-ink">Hochschulgruppen</h2>
          <p className="mb-4 text-bdas-ink-body">
            Finde deine Hochschulgruppe oder lerne die Standorte des BDAS kennen.
          </p>
          <Link href="/gruppen" className="text-bdas-red hover:underline">
            Alle Gruppen ansehen →
          </Link>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="mb-2 text-xl font-semibold text-bdas-ink">Mitgliederbereich</h2>
        <p className="mb-4 text-bdas-ink-body">
          Für den Mitgliederbereich anmelden oder ein neues Konto erstellen.
        </p>
        <div className="flex gap-3">
          <Link
            href="/anmelden"
            className="inline-flex items-center justify-center gap-2 rounded-bdas bg-bdas-red px-4 py-2.5 font-medium text-white transition-colors duration-bdas-quick ease-bdas hover:brightness-110"
          >
            Anmelden
          </Link>
          <Link
            href="/registrieren"
            className="inline-flex items-center justify-center gap-2 rounded-bdas border border-bdas-soft bg-bdas-surface px-4 py-2.5 font-medium text-bdas-ink transition-colors duration-bdas-quick ease-bdas hover:bg-bdas-overlay-hover"
          >
            Registrieren
          </Link>
        </div>
      </Card>
    </main>
  );
}
