import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isFlagOn } from "@bdas/feature-flags";

import { GLOSSAR_BEREICHE } from "../../../lib/glossar/eintraege";
import { glossarFuer } from "../../../lib/glossar/seite";
import { loadCurrentMember } from "../../_dashboard/session";

// Reads the session to decide whether board-only terms are shown.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Begriffe" };

/**
 * Every glossary term, grouped by area, A–Z within each (Spec 2026-09-24 D6).
 * Public: people registering are not signed in yet and need it most.
 */
export default async function BegriffePage() {
  if (!isFlagOn("glossar")) notFound();
  const me = await loadCurrentMember();
  const byBereich = glossarFuer(me?.grants ?? []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-bdas-ink">Begriffe</h1>
        <p className="mt-2 text-bdas-ink-muted">
          Was die Wörter auf der Plattform bedeuten. Dieselben Erklärungen findest du hinter jedem
          „?“ neben einem Begriff.
        </p>
      </header>
      {GLOSSAR_BEREICHE.map(({ key, label }) => {
        const eintraege = byBereich.get(key);
        if (!eintraege?.length) return null;
        return (
          <section key={key} className="mb-8" aria-labelledby={`bereich-${key}`}>
            <h2 id={`bereich-${key}`} className="mb-3 text-xl font-bold text-bdas-ink">
              {label}
            </h2>
            <dl className="flex flex-col gap-3">
              {eintraege.map((e) => (
                <div
                  key={e.key}
                  id={e.key}
                  className="scroll-mt-24 rounded-bdas border border-bdas-soft bg-bdas-surface p-4 shadow-bdas-card-low"
                >
                  <dt className="font-bold text-bdas-ink">{e.begriff}</dt>
                  <dd className="mt-1 text-bdas-ink-body">{e.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </main>
  );
}
