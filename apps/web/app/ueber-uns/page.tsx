import type { Metadata } from "next";

import { Render, type Data } from "@puckeditor/core";

import { getPage } from "@bdas/content";
import { getDb } from "@bdas/db";
import { isFlagOn } from "@bdas/feature-flags";
import { isFederalBoard } from "@bdas/members";

import { breiteClass, normalizeContent, puckConfig } from "../_content/puck-config";
import { SeiteBearbeitenLink } from "../_content/SeiteBearbeitenLink";
import { loadCurrentMember } from "../_dashboard/session";
import { requirePublicShellFlag } from "../_public/flag";

export const dynamic = "force-dynamic";

const SLUG = "ueber-uns";

export const metadata: Metadata = {
  title: "Über uns",
  description:
    "Der Bund der Alevitischen Studierenden in Deutschland (BDAS) — wer wir sind und wofür wir stehen.",
};

export default async function KurzportraitPage() {
  requirePublicShellFlag();

  const contentOn = isFlagOn("content");
  const page = contentOn ? await getPage(getDb(), SLUG) : null;
  const me = contentOn ? await loadCurrentMember() : null;
  const canEdit = me !== null && isFederalBoard(me.grants);

  return (
    <main className="py-12">
      {canEdit ? (
        <SeiteBearbeitenLink href="/ueber-uns/bearbeiten" breiteKlasse={breiteClass("schmal")} />
      ) : null}
      {page ? (
        <Render config={puckConfig} data={normalizeContent(page.data as Data, "schmal")} />
      ) : (
        <div className={`mx-auto flex w-full flex-col gap-6 px-4 ${breiteClass("schmal")}`}>
          {/* Platzhaltertext — bearbeitbar durch den Bundessprecher*innenrat (Spec §8). */}
          <p className="text-bdas-ink-body">
            Der Bund der Alevitischen Studierenden in Deutschland (BDAS) ist der Zusammenschluss
            alevitischer Hochschulgruppen an deutschen Universitäten. Wir vernetzen Studierende,
            organisieren Veranstaltungen und vertreten die Interessen alevitischer Studierender.
          </p>
          <p className="text-bdas-ink-body">
            Von der Erstsemester-Begrüßung bis zur Bundeskonferenz: Unsere Hochschulgruppen leben
            alevitische Werte im Studienalltag — offen, demokratisch und solidarisch.
          </p>
        </div>
      )}
    </main>
  );
}
